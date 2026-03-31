import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskService } from '../services/task.service.js';
import type { ReviewGenerator } from '../services/review-generator.js';
import { formatReview, formatReviewMarkdown, formatReviewSummary } from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import { VerificationError } from '../utils/errors.js';

export interface ReviewCommandOptions {
  against?: string;
  files?: string[];
  output?: 'terminal' | 'markdown' | 'json';
  outputFile?: string;
  cwd?: string;
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
