import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import { formatPlan, formatPlanMarkdown } from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import { PlanGenerationError } from '../utils/errors.js';

export interface PlanCommandOptions {
  files?: string[];
  output?: 'terminal' | 'clipboard' | 'markdown' | 'json';
  outputFile?: string;
}

export async function runPlanCommand(
  taskService: TaskService,
  query: string,
  options: PlanCommandOptions = {}
): Promise<void> {
  const logger = getLogger();
  const outputFormat = options.output ?? 'terminal';

  logger.info(`Starting plan generation for: "${query}"`);

  // 1. Create task
  const task = await taskService.createPlanTask(query, process.cwd());
  logger.debug(`Task created: ${task.id}`);

  // 2. Generate plan with spinner
  const spinner = ora('Analyzing codebase and generating plan...').start();

  try {
    const plan = await taskService.generatePlan(task, options.files);

    spinner.succeed(chalk.green('Plan generated successfully!'));

    // 3. Save plan to storage
    await taskService.savePlan(task.id, plan);

    // 4. Output the plan
    switch (outputFormat) {
      case 'clipboard': {
        const markdown = formatPlanMarkdown(plan);
        try {
          const { execSync } = await import('node:child_process');
          const isMac = process.platform === 'darwin';
          const isLinux = process.platform === 'linux';
          if (isMac) {
            execSync('pbcopy', { input: markdown });
          } else if (isLinux && process.env.XDG_SESSION_TYPE) {
            execSync('xclip -selection clipboard', { input: markdown });
          } else {
            // Fallback: write to stdout
            process.stdout.write(markdown);
            console.log(chalk.yellow('\n(Clipboard not supported on this platform, output to stdout)'));
          }
          console.log(chalk.green(`Plan copied to clipboard! (${plan.steps.length} steps)`));
        } catch {
          // Fallback if clipboard fails
          process.stdout.write(markdown);
          console.log(chalk.yellow('\n(Could not access clipboard, output to stdout)'));
        }
        break;
      }

      case 'markdown': {
        const markdown = formatPlanMarkdown(plan);
        if (options.outputFile) {
          const outputPath = path.resolve(options.outputFile);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, markdown, 'utf-8');
          console.log(chalk.green(`Plan exported to: ${outputPath}`));
        } else {
          process.stdout.write(markdown);
        }
        break;
      }

      case 'json': {
        const json = JSON.stringify(plan, null, 2);
        if (options.outputFile) {
          const outputPath = path.resolve(options.outputFile);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, json, 'utf-8');
          console.log(chalk.green(`Plan exported to: ${outputPath}`));
        } else {
          process.stdout.write(json);
        }
        break;
      }

      case 'terminal':
      default: {
        process.stdout.write(`${formatPlan(plan)}\n`);
        break;
      }
    }

    // Always show task ID for reference
    console.log(chalk.dim(`\nTask ID: ${task.id}`));
  } catch (error) {
    spinner.fail(chalk.red('Plan generation failed'));
    if (error instanceof PlanGenerationError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}
