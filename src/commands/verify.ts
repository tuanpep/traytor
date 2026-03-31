import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import type { Verifier } from '../core/verifier.js';
import { formatVerification, formatVerificationSummary, formatPhase } from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import { TaskNotFoundError, VerificationError, PhaseNotFoundError } from '../utils/errors.js';

export interface VerifyCommandOptions {
  cwd?: string;
  /** Verify a specific phase by 1-based order number (for phases tasks) */
  phase?: number;
}

/**
 * Verify a task's implementation against its plan, or verify a specific phase.
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

  // 2. If --phase is specified, verify that specific phase
  if (options.phase !== undefined) {
    await verifyPhase(taskService, verifier, task, options.phase, options);
    return;
  }

  // 3. Standard plan-based verification
  if (!task.plan) {
    console.error(chalk.red(`Task "${taskId}" has no plan to verify against.`));
    return;
  }

  // 4. Display task info
  console.log(chalk.bold(`Verifying task: ${chalk.cyan(taskId)}`));
  console.log(chalk.dim(`Query: ${task.query}`));
  console.log(chalk.dim(`Plan: ${task.plan.id} (${task.plan.steps.length} steps)`));
  console.log('');

  // 5. Run verification
  const spinner = ora('Analyzing codebase and verifying implementation...').start();

  try {
    const verification = await verifier.verify(task, {
      workingDir: options.cwd,
    });

    spinner.succeed(chalk.green('Verification complete!'));

    // 6. Display results
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

// ─── Phase Verification ───────────────────────────────────────────────────

/**
 * Verify a specific phase of a multi-phase task.
 */
async function verifyPhase(
  taskService: TaskService,
  verifier: Verifier,
  task: NonNullable<Awaited<ReturnType<typeof taskService.getTask>>>,
  phaseOrder: number,
  options: VerifyCommandOptions
): Promise<void> {
  // 1. Validate task has phases
  if (task.type !== 'phases' || !task.phases || task.phases.length === 0) {
    console.error(chalk.red(`Task "${task.id}" is not a phases task or has no phases.`));
    return;
  }

  // 2. Get the phase
  let phase;
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
    console.error(chalk.red(`Phase ${phaseOrder} has no plan to verify against.`));
    return;
  }

  // 4. Display phase info
  console.log(chalk.bold(`Verifying ${chalk.cyan(task.id)} phase ${phaseOrder}: ${phase.name}`));
  console.log('');
  console.log(formatPhase(phase));
  console.log('');

  // 5. Build a temporary task for verification scoped to this phase
  const phaseTask = {
    ...task,
    plan: phase.plan,
    query: `Phase ${phaseOrder}: ${phase.name}`,
  };

  // 6. Run verification
  const spinner = ora(`Verifying phase ${phaseOrder}...`).start();

  try {
    const verification = await verifier.verify(phaseTask, {
      workingDir: options.cwd,
    });

    spinner.succeed(chalk.green(`Phase ${phaseOrder} verification complete!`));

    // 7. Save verification result to the phase
    await taskService.savePhaseVerification(task.id, phaseOrder, verification);

    // 8. Display results
    console.log('');
    console.log(formatVerificationSummary(verification));
    console.log('');
    console.log(formatVerification(verification));
  } catch (error) {
    spinner.fail(chalk.red(`Phase ${phaseOrder} verification failed`));
    if (error instanceof VerificationError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}
