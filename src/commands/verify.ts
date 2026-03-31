import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import type { Verifier } from '../core/verifier.js';
import type { AgentService } from '../services/agent-service.js';
import { formatVerification, formatVerificationSummary, formatPhase } from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import { TaskNotFoundError, VerificationError, PhaseNotFoundError } from '../utils/errors.js';
import { VerificationFixService } from '../services/verification-fix-service.js';

export interface VerifyCommandOptions {
  cwd?: string;
  /** Verify a specific phase by 1-based order number (for phases tasks) */
  phase?: number;
  /** Verification mode: fresh (full analysis) or reverify (focus on open comments) */
  mode?: 'fresh' | 'reverify';
  /** Mark a specific comment as fixed or ignored */
  fixComment?: string;
  /** Status to set for the fixed comment */
  fixCommentStatus?: 'fixed' | 'ignored';
  /** Fix verification comments using an agent */
  fix?: boolean;
  /** Comma-separated list of comment IDs to fix */
  fixCommentIds?: string;
  /** Fix all blocking comments (critical + major) */
  fixAll?: boolean;
  /** Batch size for fixing comments */
  batchSize?: number;
  /** Agent to use for fixing */
  agent?: string;
  /** Severity levels to fix (comma-separated) */
  severity?: string;
  /** Dry run for fix operations */
  dryRun?: boolean;
}

/**
 * Verify a task's implementation against its plan, or verify a specific phase.
 */
export async function runVerifyCommand(
  taskService: TaskService,
  verifier: Verifier,
  agentService: AgentService | undefined,
  taskId: string,
  options: VerifyCommandOptions = {}
): Promise<void> {
  const logger = getLogger();
  const workingDir = options.cwd ?? process.cwd();

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

  // 2. Handle comment status update
  if (options.fixComment && options.fixCommentStatus) {
    await updateCommentStatus(taskService, taskId, options.fixComment, options.fixCommentStatus);
    return;
  }

  // 3. Handle fix operations
  if (options.fix && agentService) {
    await runVerificationFix(taskService, verifier, agentService, task, workingDir, options);
    return;
  }

  // 4. If --phase is specified, verify that specific phase
  if (options.phase !== undefined) {
    await verifyPhase(taskService, verifier, task, options.phase, options);
    return;
  }

  // 5. Standard plan-based verification
  if (!task.plan) {
    console.error(chalk.red(`Task "${taskId}" has no plan to verify against.`));
    return;
  }

  // 6. Display task info
  console.log(chalk.bold(`Verifying task: ${chalk.cyan(taskId)}`));
  console.log(chalk.dim(`Query: ${task.query}`));
  console.log(chalk.dim(`Plan: ${task.plan.id} (${task.plan.steps.length} steps)`));
  if (options.mode === 'reverify' && task.verification) {
    const openCount = task.verification.comments.filter((c) => c.status === 'open').length;
    console.log(chalk.dim(`Mode: re-verify (${openCount} open comments)`));
  }
  console.log('');

  // 7. Run verification
  const spinner = ora('Analyzing codebase and verifying implementation...').start();

  try {
    const verification = await verifier.verify(task, {
      workingDir: options.cwd,
      mode: options.mode,
    });

    spinner.succeed(chalk.green('Verification complete!'));

    // 8. Save verification result
    await taskService.saveVerification(taskId, verification);

    // 9. Display results
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
  if (options.mode === 'reverify' && phase.verification) {
    const openCount = phase.verification.comments.filter((c) => c.status === 'open').length;
    console.log(chalk.dim(`Mode: re-verify (${openCount} open comments)`));
  }
  console.log('');
  console.log(formatPhase(phase));
  console.log('');

  // 5. Build a temporary task for verification scoped to this phase
  const phaseTask = {
    ...task,
    plan: phase.plan,
    query: `Phase ${phaseOrder}: ${phase.name}`,
    verification: options.mode === 'reverify' ? phase.verification : undefined,
  };

  // 6. Run verification
  const spinner = ora(`Verifying phase ${phaseOrder}...`).start();

  try {
    const verification = await verifier.verify(phaseTask, {
      workingDir: options.cwd,
      mode: options.mode,
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

// ─── Comment Status Management ────────────────────────────────────────────

/**
 * Update the status of a verification comment.
 */
async function updateCommentStatus(
  taskService: TaskService,
  taskId: string,
  commentId: string,
  status: 'fixed' | 'ignored'
): Promise<void> {
  try {
    await taskService.updateVerificationCommentStatus(taskId, commentId, status);
    console.log(chalk.green(`Comment ${commentId} marked as ${status}`));
  } catch (error) {
    if (error instanceof VerificationError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}

// ─── Verification Fix ─────────────────────────────────────────────────────

async function runVerificationFix(
  taskService: TaskService,
  verifier: Verifier,
  agentService: AgentService,
  task: Awaited<ReturnType<typeof taskService.getTask>>,
  workingDir: string,
  options: VerifyCommandOptions
): Promise<void> {
  const severityFilter = options.severity?.split(',').map((s) => s.trim()) ?? ['critical', 'major'];
  const fixService = new VerificationFixService(agentService, workingDir);

  // First run verification if not already done
  let verification = task.verification;
  if (!verification || options.mode === 'fresh') {
    console.log(chalk.bold('\nRunning verification first...\n'));
    const spinner = ora('Analyzing codebase...').start();

    try {
      verification = await verifier.verify(task, {
        workingDir,
        mode: options.mode ?? 'fresh',
        severityFilter: severityFilter as ('critical' | 'major' | 'minor')[],
      });
      spinner.succeed(chalk.green('Verification complete'));

      // Save verification
      if (task.type === 'phases' && options.phase !== undefined) {
        await taskService.savePhaseVerification(task.id, options.phase, verification);
      } else {
        await taskService.saveVerification(task.id, verification);
      }
    } catch (error) {
      spinner.fail(chalk.red('Verification failed'));
      throw error;
    }
  }

  if (!verification || verification.comments.length === 0) {
    console.log(chalk.green('\n✓ No issues found!\n'));
    return;
  }

  // Show summary
  console.log('');
  console.log(formatVerificationSummary(verification));
  console.log('');

  // Determine which comments to fix
  if (options.fixCommentIds) {
    const commentIds = options.fixCommentIds.split(',').map((s) => s.trim());
    const result = await fixService.fixSelectedComments(
      commentIds,
      verification,
      task,
      options.agent
    );

    console.log(chalk.bold('\n📊 Fix Selected Results\n'));
    console.log(`  Total: ${result.total}`);
    console.log(`  Fixed: ${chalk.green(result.fixed.toString())}`);
    console.log(`  Failed: ${result.failed > 0 ? chalk.red(result.failed.toString()) : '0'}`);

    if (result.failed > 0) {
      process.exit(1);
    }
  } else if (options.fixAll) {
    const result = await fixService.fixAllComments(verification, task, {
      agentName: options.agent,
      severityFilter,
      dryRun: options.dryRun,
    });

    console.log(chalk.bold('\n📊 Fix All Results\n'));
    console.log(`  Total: ${result.total}`);
    console.log(`  Fixed: ${chalk.green(result.fixed.toString())}`);
    console.log(`  Failed: ${result.failed > 0 ? chalk.red(result.failed.toString()) : '0'}`);

    if (result.failed > 0) {
      process.exit(1);
    }
  } else {
    console.log(chalk.dim('Use --fix-comment-ids or --fix-all to fix comments'));
  }
}
