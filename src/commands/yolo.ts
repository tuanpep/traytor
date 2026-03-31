import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import type { PlanGenerator } from '../services/plan-generator.js';
import type { AgentService } from '../services/agent-service.js';
import type { Verifier } from '../core/verifier.js';
import type { GitService } from '../services/git-service.js';
import type { YOLOConfig } from '../config/schema.js';
import { YOLOService as YOLOServiceImpl } from '../services/yolo-service.js';

export interface YOLOCommandContext {
  taskService: TaskService;
  planGenerator: PlanGenerator;
  agentService: AgentService;
  verifier: Verifier;
  gitService?: GitService;
  yoloConfig?: YOLOConfig;
}

export interface YOLOCommandOptions {
  fromPhase?: number;
  toPhase?: number;
  skipPlanning?: boolean;
  executionAgent?: string;
  planAgent?: string;
  verifyAgent?: string;
  noVerify?: boolean;
  verifySeverity?: string[];
  planTemplate?: string;
  verifyTemplate?: string;
  autoCommit?: boolean;
  commitMessage?: string;
  timeout?: number;
  maxRetries?: number;
  dryRun?: boolean;
  parallel?: boolean;
}

export async function runYOLOCommand(
  ctx: YOLOCommandContext,
  taskId: string,
  options: YOLOCommandOptions = {}
): Promise<void> {
  const spinner = ora('Initializing YOLO execution...').start();

  try {
    const yoloService = new YOLOServiceImpl(
      ctx.taskService,
      ctx.planGenerator,
      ctx.agentService,
      ctx.verifier,
      ctx.gitService,
      ctx.yoloConfig
    );

    spinner.succeed();

    const result = await yoloService.executePhases(taskId, options);

    console.log('\n');

    if (result.failedPhases > 0) {
      console.log(
        chalk.red(`\n⚠ YOLO execution completed with ${result.failedPhases} failure(s)\n`)
      );
      process.exit(1);
    } else {
      console.log(chalk.green('\n✅ YOLO execution completed successfully!\n'));
    }
  } catch (error) {
    spinner.fail(chalk.red('YOLO execution failed'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}
