import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskService } from '../services/task.service.js';
import type { ReviewGenerator } from '../services/review-generator.js';
import type { AgentService } from '../services/agent-service.js';
import { formatReview, formatReviewMarkdown, formatReviewSummary } from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import { VerificationError } from '../utils/errors.js';

export interface ReviewCommandOptions {
  against?: string;
  files?: string[];
  output?: 'terminal' | 'markdown' | 'json';
  outputFile?: string;
  cwd?: string;
  fix?: boolean;
  taskId?: string;
  fixCommentIds?: string;
  fixTemplate?: string;
  agentService?: AgentService;
}

/**
 * Run a code review on the codebase or specified files.
 */
export async function runReviewCommand(
  taskService: TaskService,
  reviewGenerator: ReviewGenerator,
  query: string,
  options: ReviewCommandOptions = {}
): Promise<void> {
  const logger = getLogger();
  const outputFormat = options.output ?? 'terminal';

  // Handle fix mode for existing review
  if (options.fix && !query) {
    await runReviewFix(taskService, reviewGenerator, options);
    return;
  }

  logger.info(`Starting code review for: "${query}"`);

  // 1. Create a review task
  const task = await taskService.createReviewTask(query, options.cwd || process.cwd());
  logger.debug(`Review task created: ${task.id}`);

  // 2. Display scope info
  const scopeParts: string[] = [];
  if (options.against) scopeParts.push(`against ${chalk.cyan(options.against)}`);
  if (options.files && options.files.length > 0) scopeParts.push(`${options.files.length} file(s)`);
  if (scopeParts.length > 0) {
    console.log(chalk.dim(`Scope: ${scopeParts.join(', ')}`));
  }
  console.log('');

  // 3. Generate review with spinner
  const spinner = ora('Analyzing code and generating review...').start();

  try {
    const review = await reviewGenerator.generate(query, {
      against: options.against,
      files: options.files,
      cwd: options.cwd,
    });

    spinner.succeed(chalk.green('Code review complete!'));

    // 4. Save review to task
    await taskService.saveReview(task.id, review);

    // 5. Output the review
    switch (outputFormat) {
      case 'markdown': {
        const markdown = formatReviewMarkdown(review);
        if (options.outputFile) {
          const outputPath = path.resolve(options.outputFile);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, markdown, 'utf-8');
          console.log(chalk.green(`Review exported to: ${outputPath}`));
        } else {
          process.stdout.write(markdown);
        }
        break;
      }

      case 'json': {
        const json = JSON.stringify(review, null, 2);
        if (options.outputFile) {
          const outputPath = path.resolve(options.outputFile);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, json, 'utf-8');
          console.log(chalk.green(`Review exported to: ${outputPath}`));
        } else {
          process.stdout.write(json);
        }
        break;
      }

      case 'terminal':
      default: {
        console.log('');
        console.log(formatReviewSummary(review));
        console.log('');
        console.log(formatReview(review));
        break;
      }
    }

    // Always show task ID for reference
    console.log(chalk.dim(`\nTask ID: ${task.id}`));
  } catch (error) {
    spinner.fail(chalk.red('Code review failed'));
    if (error instanceof VerificationError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}

/**
 * Send review comments to an agent for fixing.
 */
async function runReviewFix(
  taskService: TaskService,
  reviewGenerator: ReviewGenerator,
  options: ReviewCommandOptions
): Promise<void> {
  const logger = getLogger();

  if (!options.taskId) {
    console.error(
      chalk.red(
        '--fix requires a task ID. Usage: traytor review --fix --task-id <task-id> [--fix-comment-ids <ids>]'
      )
    );
    console.log(
      chalk.dim(
        'Example: traytor review --fix --task-id task_123 --fix-comment-ids rcomment_1,rcomment_2'
      )
    );
    return;
  }

  const taskId = options.taskId;

  logger.info(`Fixing review comments for task: ${taskId}`);

  // 1. Load the task and review
  const task = await taskService.getTask(taskId);
  if (!task.review) {
    console.error(chalk.red(`Task "${taskId}" has no review to fix.`));
    return;
  }

  const review = task.review;
  const commentIds = options.fixCommentIds
    ? options.fixCommentIds.split(',').map((id) => id.trim())
    : undefined;

  const selectedComments = commentIds
    ? review.comments.filter((c) => commentIds.includes(c.id))
    : review.comments;

  if (selectedComments.length === 0) {
    console.error(chalk.red('No comments found matching the specified IDs.'));
    return;
  }

  // 2. Execute fixes via agent
  const fixPrompt = reviewGenerator.generateFixPrompt(review, commentIds);

  const spinner = ora(`Fixing ${selectedComments.length} review comments...`).start();

  try {
    if (!options.agentService) {
      spinner.fail(chalk.red('Agent service not available for review fix execution'));
      console.log(chalk.dim('Falling back to prompt-only mode...'));
      console.log(chalk.bold('\nReview Fix Prompt:'));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(fixPrompt);
      console.log(chalk.dim('─'.repeat(60)));
      return;
    }

    const fixTask = {
      id: `review_fix_${review.id}`,
      type: 'review' as const,
      query: fixPrompt,
      status: 'in_progress' as const,
      context: task.context,
      executions: [],
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const execResult = await options.agentService.execute(fixTask, {
      cwd: options.cwd || process.cwd(),
    });

    if (execResult.success) {
      spinner.succeed(chalk.green(`${selectedComments.length} review comments fixed!`));
    } else {
      spinner.fail(chalk.red('Review fix failed'));
      if (execResult.stderr) {
        console.error(chalk.dim(execResult.stderr));
      }
    }
  } catch (error) {
    spinner.fail(chalk.red('Review fix execution failed'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}
