import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import type { Verifier } from '../core/verifier.js';
import { formatVerification, formatVerificationSummary } from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import { TaskNotFoundError, VerificationError } from '../utils/errors.js';

export interface VerifyCommandOptions {
  cwd?: string;
}

/**
 * Verify a task's implementation against its plan.
 */
export async function runVerifyCommand(
  taskService: TaskService,
  verifier: Verifier,
  taskId: string,
  options: VerifyCommandOptions = {}
): Promise<void> {
  const logger = getLogger();

  logger.info(`Starting verification for task: ${taskId}`);

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
    console.error(chalk.red(`Task "${taskId}" has no plan to verify against.`));
    return;
  }

  // 3. Display task info
  console.log(chalk.bold(`Verifying task: ${chalk.cyan(taskId)}`));
  console.log(chalk.dim(`Query: ${task.query}`));
  console.log(chalk.dim(`Plan: ${task.plan.id} (${task.plan.steps.length} steps)`));
  console.log('');

  // 4. Run verification
  const spinner = ora('Analyzing codebase and verifying implementation...').start();

  try {
    const verification = await verifier.verify(task, {
      workingDir: options.cwd,
    });

    spinner.succeed(chalk.green('Verification complete!'));

    // 5. Display results
    console.log('');
    console.log(formatVerificationSummary(verification));
    console.log('');
    console.log(formatVerification(verification));
  } catch (error) {
    spinner.fail(chalk.red('Verification failed'));
    if (error instanceof VerificationError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}
