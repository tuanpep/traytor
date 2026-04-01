import chalk from 'chalk';
import { getLogger } from '../utils/logger.js';
import type { TaskService } from './task.service.js';
import type { PlanGenerator } from './plan-generator.js';
import type { AgentService } from './agent-service.js';
import type { Verifier } from '../core/verifier.js';
import type { Task } from '../models/task.js';
import type { Phase } from '../models/phase.js';
import type { Plan } from '../models/plan.js';
import type { YOLOConfig } from '../config/schema.js';
import { createTaskId } from '../models/task.js';

export interface YOLOOptions {
  fromPhase?: number;
  toPhase?: number;
  skipPlanning?: boolean;
  executionAgent?: string;
  planAgent?: string;
  verificationAgent?: string;
  noVerify?: boolean;
  verifySeverity?: string[];
  planTemplate?: string;
  verifyTemplate?: string;
  autoCommit?: boolean;
  commitMessage?: string;
  timeout?: number;
  maxRetries?: number;
  dryRun?: boolean;
}

export interface PhaseResult {
  phaseOrder: number;
  phaseName: string;
  status: 'success' | 'failed' | 'skipped';
  planGenerated?: boolean;
  executionResult?: {
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  verificationResult?: {
    approved: boolean;
    commentsCount: number;
  };
  commitResult?: {
    hash: string;
    message: string;
  };
  error?: string;
}

export interface YOLOResult {
  taskId: string;
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  phaseResults: PhaseResult[];
  totalTokens?: {
    input: number;
    output: number;
  };
}

export class YOLOService {
  private logger = getLogger();
  private readonly config: YOLOConfig;

  constructor(
    private readonly taskService: TaskService,
    private readonly planGenerator: PlanGenerator,
    private readonly agentService: AgentService,
    private readonly verifier: Verifier,
    private readonly gitService?: { commit(message: string): Promise<{ hash: string }> },
    config?: Partial<YOLOConfig>
  ) {
    this.config = {
      skipPlanning: config?.skipPlanning ?? false,
      executionAgent: config?.executionAgent ?? 'claude-code',
      planTemplate: config?.planTemplate,
      planAgent: config?.planAgent,
      verificationEnabled: config?.verificationEnabled ?? true,
      verificationAgent: config?.verificationAgent,
      verificationSeverity: config?.verificationSeverity ?? ['critical', 'major'],
      verificationTemplate: config?.verificationTemplate,
      reviewAgent: config?.reviewAgent,
      reviewTemplate: config?.reviewTemplate,
      reviewCategories: config?.reviewCategories,
      autoCommit: config?.autoCommit ?? false,
      commitMessage: config?.commitMessage ?? 'auto: complete phase {phase}',
      maxRetriesPerPhase: config?.maxRetriesPerPhase ?? 3,
      timeout: config?.timeout,
    };
  }

  private getEffectiveOptions(options: YOLOOptions): Required<YOLOOptions> {
    return {
      fromPhase: options.fromPhase ?? 1,
      toPhase: options.toPhase ?? Infinity,
      skipPlanning: options.skipPlanning ?? this.config.skipPlanning,
      executionAgent: options.executionAgent ?? this.config.executionAgent,
      planAgent: options.planAgent ?? this.config.planAgent ?? 'claude-code',
      verificationAgent:
        options.verificationAgent ?? this.config.verificationAgent ?? 'claude-code',
      noVerify: options.noVerify ?? !this.config.verificationEnabled,
      verifySeverity: options.verifySeverity ??
        this.config.verificationSeverity ?? ['critical', 'major'],
      planTemplate: options.planTemplate ?? this.config.planTemplate ?? '',
      verifyTemplate: options.verifyTemplate ?? this.config.verificationTemplate ?? '',
      autoCommit: options.autoCommit ?? this.config.autoCommit,
      commitMessage:
        options.commitMessage ?? this.config.commitMessage ?? 'auto: complete phase {phase}',
      timeout: options.timeout ?? this.config.timeout ?? 300000,
      maxRetries: options.maxRetries ?? this.config.maxRetriesPerPhase ?? 3,
      dryRun: options.dryRun ?? false,
    };
  }

  async executePhases(taskId: string, options: YOLOOptions = {}): Promise<YOLOResult> {
    const effectiveOptions = this.getEffectiveOptions(options);
    this.logger.info(`Starting YOLO execution for task: ${taskId}`);

    const task = await this.taskService.getTask(taskId);
    if (task.type !== 'phases' || !task.phases) {
      throw new Error(`Task "${taskId}" is not a phases task`);
    }

    const phases = task.phases;
    const fromPhase = effectiveOptions.fromPhase ?? this.getCurrentPhaseOrder(phases);
    const toPhase = effectiveOptions.toPhase ?? phases.length;

    console.log(chalk.bold('\n🚀 YOLO Mode Execution\n'));
    console.log(chalk.dim(`Task: ${taskId}`));
    console.log(chalk.dim(`Executing phases ${fromPhase} to ${toPhase} of ${phases.length}`));
    console.log('');

    const phaseResults: PhaseResult[] = [];
    let completedPhases = 0;
    let failedPhases = 0;

    for (const phase of phases) {
      if (phase.order < fromPhase) {
        phaseResults.push({
          phaseOrder: phase.order,
          phaseName: phase.name,
          status: 'skipped',
        });
        continue;
      }

      if (phase.order > toPhase) {
        break;
      }

      console.log(chalk.cyan(`\n${'─'.repeat(50)}`));
      console.log(chalk.bold(`Phase ${phase.order}/${phases.length}: ${phase.name}`));
      console.log(chalk.cyan('─'.repeat(50)));

      const result = await this.executePhase(task, phase, effectiveOptions);

      phaseResults.push(result);

      if (result.status === 'success') {
        completedPhases++;
        console.log(chalk.green(`\n✓ Phase ${phase.order} completed successfully`));
      } else if (result.status === 'failed') {
        failedPhases++;
        console.log(chalk.red(`\n✗ Phase ${phase.order} failed`));
        if (result.error) {
          console.log(chalk.dim(`  Error: ${result.error}`));
        }

        if (!effectiveOptions.dryRun) {
          console.log(chalk.yellow('\nStopping YOLO execution due to phase failure.'));
          break;
        }
      }
    }

    const summary: YOLOResult = {
      taskId,
      totalPhases: phases.length,
      completedPhases,
      failedPhases,
      phaseResults,
    };

    console.log(chalk.bold('\n📊 YOLO Execution Summary\n'));
    console.log(`  Total phases: ${phases.length}`);
    console.log(`  Executed: ${completedPhases + failedPhases}`);
    console.log(`  Completed: ${chalk.green(completedPhases.toString())}`);
    console.log(`  Failed: ${failedPhases > 0 ? chalk.red(failedPhases.toString()) : '0'}`);

    return summary;
  }

  private getCurrentPhaseOrder(phases: Phase[]): number {
    const nextPhase = phases.find((p) => p.status === 'pending' || p.status === 'in_progress');
    return nextPhase?.order ?? 1;
  }

  private async executePhase(
    task: Task,
    phase: Phase,
    options: Required<YOLOOptions>
  ): Promise<PhaseResult> {
    const result: PhaseResult = {
      phaseOrder: phase.order,
      phaseName: phase.name,
      status: 'failed',
    };

    try {
      let plan: Plan | undefined = phase.plan;

      if (!plan && !options.skipPlanning && !options.dryRun) {
        console.log(chalk.dim('\n  Generating plan...'));
        plan = await this.planPhase(task, phase);
        result.planGenerated = true;
        console.log(chalk.green('  Plan generated'));
      } else if (plan) {
        console.log(chalk.dim('\n  Using existing plan'));
        result.planGenerated = false;
      } else {
        console.log(chalk.dim('\n  Skipping plan generation (--skip-planning)'));
        result.planGenerated = false;
      }

      let executionSuccess = true;
      let verificationPassed = true;
      if (!options.dryRun) {
        console.log(chalk.dim('\n  Executing...'));
        const execResult = await this.execPhase(task, phase, plan, options);
        result.executionResult = execResult;
        executionSuccess = execResult.success;
        console.log(
          execResult.success ? chalk.green('  Execution complete') : chalk.red('  Execution failed')
        );
      }

      if (executionSuccess && !options.noVerify && !options.dryRun) {
        console.log(chalk.dim('\n  Verifying...'));
        const verifyResult = await this.verifyPhase(task, phase, options);
        result.verificationResult = {
          approved: verifyResult.approved,
          commentsCount: verifyResult.blockingComments,
        };
        verificationPassed = verifyResult.approved;
        console.log(
          verifyResult.approved
            ? chalk.green(`  Verification passed (${verifyResult.commentsCount} comments)`)
            : chalk.yellow(
                `  Verification found ${verifyResult.blockingComments} blocking issues (${verifyResult.commentsCount} total)`
              )
        );
      }

      if (options.autoCommit && !options.dryRun && executionSuccess && verificationPassed) {
        console.log(chalk.dim('\n  Committing...'));
        const commitResult = await this.commitPhase(task, phase, options);
        if (commitResult) {
          result.commitResult = commitResult;
          console.log(chalk.green(`  Committed: ${commitResult.hash.slice(0, 7)}`));
        }
      }

      result.status = executionSuccess && verificationPassed ? 'success' : 'failed';
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Phase ${phase.order} failed: ${result.error}`);
    }

    return result;
  }

  private async planPhase(task: Task, phase: Phase): Promise<Plan> {
    const contextCarryOver = this.taskService.getContextCarryOver(task, phase.order);
    const plan = await this.planGenerator.generate(
      `${task.query}\n\nPhase ${phase.order}: ${phase.name}\n\n${phase.description || ''}`,
      contextCarryOver?.filesChanged
    );

    await this.taskService.savePhasePlan(task.id, phase.order, plan);
    await this.taskService.updatePhaseStatus(task.id, phase.order, 'in_progress');

    return plan;
  }

  private async execPhase(
    task: Task,
    phase: Phase,
    plan: Plan | undefined,
    options: Required<YOLOOptions>
  ): Promise<{ success: boolean; stdout?: string; stderr?: string; exitCode?: number }> {
    const phaseTask: Task = {
      id: createTaskId(),
      type: 'plan',
      query: `Phase ${phase.order}: ${phase.name}`,
      status: 'in_progress',
      context: task.context,
      plan,
      executions: [],
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const result = await this.agentService.execute(phaseTask, {
        cwd: process.cwd(),
        timeout: options.timeout,
        agentName: options.executionAgent,
      });

      return {
        success: result.success,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? undefined,
      };
    } catch (error) {
      return {
        success: false,
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
      };
    }
  }

  private async verifyPhase(
    task: Task,
    phase: Phase,
    options: Required<YOLOOptions>
  ): Promise<{ approved: boolean; commentsCount: number; blockingComments: number }> {
    const phaseTask = {
      ...task,
      plan: phase.plan,
      query: `Phase ${phase.order}: ${phase.name}`,
    };

    const verification = await this.verifier.verify(phaseTask, {
      mode: 'fresh',
      severityFilter: options.verifySeverity as ('critical' | 'major' | 'minor')[],
    });

    await this.taskService.savePhaseVerification(task.id, phase.order, verification);

    const blockingCategories = options.verifySeverity;
    const blockingComments = verification.comments.filter((c) =>
      blockingCategories.includes(c.category as 'critical' | 'major' | 'minor')
    ).length;

    const approved = blockingComments === 0;

    return {
      approved,
      commentsCount: verification.comments.length,
      blockingComments,
    };
  }

  private async commitPhase(
    task: Task,
    phase: Phase,
    options: Required<YOLOOptions>
  ): Promise<{ hash: string; message: string } | undefined> {
    const messageTemplate = options.commitMessage;
    const message = messageTemplate
      .replace('{phase}', `${phase.order}: ${phase.name}`)
      .replace('{task}', task.id);

    try {
      if (this.gitService) {
        const result = await this.gitService.commit(message);
        return { hash: result.hash, message };
      }
    } catch (error) {
      this.logger.warn(`Commit failed: ${error}`);
    }

    return undefined;
  }

  private buildExecutionPrompt(task: Task, phase: Phase, plan?: Plan): string {
    let prompt = `# Task: ${task.query}\n\n`;
    prompt += `## Phase ${phase.order}: ${phase.name}\n\n`;
    if (phase.description) {
      prompt += `${phase.description}\n\n`;
    }

    if (plan) {
      prompt += `## Implementation Plan\n\n`;
      for (const step of plan.steps) {
        prompt += `### ${step.title}\n`;
        prompt += `${step.description}\n`;
        if (step.files.length > 0) {
          prompt += `Files: ${step.files.join(', ')}\n`;
        }
        prompt += '\n';
      }
    }

    return prompt;
  }
}
