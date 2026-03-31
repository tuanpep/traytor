import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import type { AgentService } from '../services/agent-service.js';
import { getLogger } from '../utils/logger.js';
import { TaskNotFoundError, AgentExecutionError } from '../utils/errors.js';

export interface ExecCommandOptions {
  cwd?: string;
  timeout?: number;
}

/**
 * Execute a task by handing off to the configured agent.
 */
export async function runExecCommand(
  taskService: TaskService,
  agentService: AgentService,
  taskId: string,
  options: ExecCommandOptions = {}
): Promise<void> {
  const logger = getLogger();

  logger.info(`Starting execution for task: ${taskId}`);

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

  // 2. Check that the task has a plan
  if (!task.plan) {
    console.error(chalk.red(`Task "${taskId}" has no plan. Generate a plan first with \`sdd plan "${task.query}"\``));
    return;
  }

  // 3. Display task info
  console.log(chalk.bold(`Executing task: ${chalk.cyan(taskId)}`));
  console.log(chalk.dim(`Query: ${task.query}`));
  console.log(chalk.dim(`Plan: ${task.plan.id} (${task.plan.steps.length} steps)`));
  console.log('');

  // 4. Execute via agent
  const spinner = ora('Handing off to agent...').start();

  try {
    const result = await agentService.execute(task, {
      cwd: options.cwd,
      timeout: options.timeout,
    });

    spinner.stop();

    // 5. Save execution record
    await taskService.addExecution(taskId, {
      status: result.success ? 'success' : 'failed',
      agentId: 'claude-code',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? undefined,
    });

    // 6. Display result
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
    console.log(chalk.dim(`Run \`sdd verify ${taskId}\` to verify the implementation.`));
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
