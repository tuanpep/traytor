import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import type { AgentService } from '../services/agent-service.js';
import type { Phase } from '../models/phase.js';
import { formatPhase } from '../ui/cli/formatter.js';
import { TaskNotFoundError, AgentExecutionError, PhaseNotFoundError } from '../utils/errors.js';

export interface ExecCommandOptions {
  cwd?: string;
  timeout?: number;
  /** Execute a specific phase by 1-based order number (for phases tasks) */
  phase?: number;
  /** Specific agent name to use */
  agent?: string;
  /** Custom template name to use */
  template?: string;
}

/**
 * Execute a task (or a specific phase of a phases task) by handing off to the configured agent.
 */
export async function runExecCommand(
  taskService: TaskService,
  agentService: AgentService,
  taskId: string,
  options: ExecCommandOptions = {}
): Promise<void> {
  // 1. Load the task
  let task;
  try {
    task = await taskService.getTask(taskId);
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
      return;
    }
    throw error;
  }

  // 2. If --phase is specified, execute that specific phase
  if (options.phase !== undefined) {
    await executePhase(taskService, agentService, task, options.phase, options);
    return;
  }

  // 3. Standard plan-based execution
  if (!task.plan) {
    console.error(
      chalk.red(
        `Task "${taskId}" has no plan. Generate a plan first with \`traytor plan "${task.query}"\``
      )
    );
    return;
  }

  // 4. Display task info
  console.log(chalk.bold(`Executing task: ${chalk.cyan(taskId)}`));
  console.log(chalk.dim(`Query: ${task.query}`));
  console.log(chalk.dim(`Plan: ${task.plan.id} (${task.plan.steps.length} steps)`));
  console.log('');

  // 5. Execute via agent
  const spinner = ora('Handing off to agent...').start();

  try {
    const result = await agentService.execute(task, {
      cwd: options.cwd,
      timeout: options.timeout,
      agentName: options.agent,
      templateName: options.template,
    });

    spinner.stop();

    // 6. Save execution record
    const agentName = options.agent ?? 'claude-code';
    await taskService.addExecution(taskId, {
      status: result.success ? 'success' : 'failed',
      agentId: agentName,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? undefined,
    });

    // 7. Display result
    console.log('');
    if (result.success) {
      console.log(chalk.green.bold('Execution completed successfully!'));
    } else {
      console.log(chalk.red.bold('Execution failed'));
    }

    console.log(chalk.dim(`Exit code: ${result.exitCode}`));
    console.log(chalk.dim(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`));

    if (result.stderr && result.stderr.trim()) {
      console.log('');
      console.log(chalk.yellow('Stderr:'));
      console.log(chalk.dim(result.stderr.slice(0, 500)));
    }

    console.log('');
    console.log(chalk.dim(`Run \`traytor verify ${taskId}\` to verify the implementation.`));
  } catch (error) {
    spinner.fail(chalk.red('Execution failed'));
    if (error instanceof AgentExecutionError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}

// ─── Phase Execution ──────────────────────────────────────────────────────

/**
 * Execute a specific phase of a multi-phase task.
 */
async function executePhase(
  taskService: TaskService,
  agentService: AgentService,
  task: NonNullable<Awaited<ReturnType<typeof taskService.getTask>>>,
  phaseOrder: number,
  options: ExecCommandOptions
): Promise<void> {
  // 1. Validate task has phases
  if (task.type !== 'phases' || !task.phases || task.phases.length === 0) {
    console.error(chalk.red(`Task "${task.id}" is not a phases task or has no phases.`));
    return;
  }

  // 2. Get the phase
  let phase: Phase;
  try {
    phase = taskService.getPhase(task, phaseOrder);
  } catch (error) {
    if (error instanceof PhaseNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
      return;
    }
    throw error;
  }

  // 3. Validate phase has a plan
  if (!phase.plan) {
    console.error(
      chalk.red(`Phase ${phaseOrder} has no plan. Generate a plan for this phase first.`)
    );
    return;
  }

  // 4. Display phase info
  console.log(chalk.bold(`Executing ${chalk.cyan(task.id)} phase ${phaseOrder}: ${phase.name}`));
  console.log('');
  console.log(formatPhase(phase));
  console.log('');

  // 5. Build context carry-over for the prompt
  const carryOver = taskService.getContextCarryOver(task, phaseOrder);
  const carryOverInfo = buildCarryOverInfo(carryOver);
  if (carryOverInfo) {
    console.log(chalk.dim('Context from previous phases:'));
    console.log(chalk.dim(carryOverInfo));
    console.log('');
  }

  // 6. Create a temporary task-like object for the phase execution
  const phaseTask = {
    ...task,
    plan: phase.plan,
    query: `Phase ${phaseOrder}: ${phase.name}\n\n${phase.description}${carryOver ? `\n\nContext from previous phases:\n${carryOverInfo}` : ''}`,
  };

  // 7. Execute via agent
  const spinner = ora(`Executing phase ${phaseOrder}...`).start();

  try {
    await taskService.updatePhaseStatus(task.id, phaseOrder, 'in_progress');

    const result = await agentService.execute(phaseTask, {
      cwd: options.cwd,
      timeout: options.timeout,
      agentName: options.agent,
      templateName: options.template,
    });

    spinner.stop();

    // 8. Save execution record
    const phaseAgentName = options.agent ?? 'claude-code';
    await taskService.addExecution(task.id, {
      status: result.success ? 'success' : 'failed',
      agentId: phaseAgentName,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? undefined,
    });

    // 9. Update phase status
    if (result.success) {
      await taskService.updatePhaseStatus(task.id, phaseOrder, 'completed');
      console.log(chalk.green.bold(`Phase ${phaseOrder} completed successfully!`));
    } else {
      await taskService.updatePhaseStatus(task.id, phaseOrder, 'blocked');
      console.log(chalk.red.bold(`Phase ${phaseOrder} failed`));
    }

    console.log(chalk.dim(`Exit code: ${result.exitCode}`));
    console.log(chalk.dim(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`));

    if (result.stderr && result.stderr.trim()) {
      console.log('');
      console.log(chalk.yellow('Stderr:'));
      console.log(chalk.dim(result.stderr.slice(0, 500)));
    }

    console.log('');
    console.log(
      chalk.dim(`Run \`traytor verify ${task.id} --phase ${phaseOrder}\` to verify this phase.`)
    );

    // Show next phase hint
    const nextPhase = task.phases!.find((p) => p.order === phaseOrder + 1);
    if (nextPhase) {
      console.log(
        chalk.dim(`Next: \`traytor exec ${task.id} --phase ${nextPhase.order}\` (${nextPhase.name})`)
      );
    }
  } catch (error) {
    spinner.fail(chalk.red(`Phase ${phaseOrder} execution failed`));
    if (error instanceof AgentExecutionError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    await taskService.updatePhaseStatus(task.id, phaseOrder, 'blocked').catch(() => {});
    throw error;
  }
}

/**
 * Build a human-readable summary of context carry-over.
 */
function buildCarryOverInfo(carryOver: Phase['contextCarryOver']): string {
  if (!carryOver) return '';

  const parts: string[] = [];

  if (carryOver.filesChanged.length > 0) {
    parts.push(`Files modified: ${carryOver.filesChanged.join(', ')}`);
  }

  if (carryOver.decisions.length > 0) {
    parts.push(`Decisions:\n${carryOver.decisions.map((d) => `  - ${d}`).join('\n')}`);
  }

  if (carryOver.rationale.length > 0) {
    parts.push(`Rationale:\n${carryOver.rationale.map((r) => `  - ${r}`).join('\n')}`);
  }

  return parts.join('\n');
}
