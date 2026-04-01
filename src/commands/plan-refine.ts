import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import { PlanGenerationError } from '../utils/errors.js';
import { formatPlan, formatPlanMarkdown } from '../ui/cli/formatter.js';

export interface PlanRefineOptions {
  output?: 'terminal' | 'clipboard' | 'markdown' | 'json';
  outputFile?: string;
}

/**
 * Refine an existing plan based on user feedback.
 * Loads the current plan, sends it to the LLM with the refinement request,
 * and updates the plan in place.
 */
export async function runPlanRefineCommand(
  taskService: TaskService,
  taskId: string,
  feedback: string,
  options: PlanRefineOptions = {}
): Promise<void> {
  // 1. Load the task
  let task;
  try {
    task = await taskService.getTask(taskId);
  } catch {
    console.error(chalk.red(`Task "${taskId}" not found.`));
    console.log(chalk.dim('Use `traytor history` to list all tasks.'));
    process.exit(1);
  }

  if (!task.plan) {
    console.error(chalk.red(`Task "${taskId}" has no plan to refine.`));
    console.log(chalk.dim('Generate a plan first with `traytor plan <query>`.'));
    process.exit(1);
  }

  // 2. Display current plan info
  console.log(chalk.bold(`Refining plan for task: ${chalk.cyan(taskId)}`));
  console.log(chalk.dim(`Query: ${task.query}`));
  console.log(chalk.dim(`Current plan: ${task.plan.steps.length} steps`));
  console.log('');

  // 3. Refine the plan
  const spinner = ora('Refining plan with LLM...').start();

  try {
    const refinedPlan = await taskService.refinePlan(task, feedback);

    spinner.succeed(chalk.green('Plan refined successfully!'));

    // 4. Output the refined plan
    const outputFormat = options.output ?? 'terminal';

    switch (outputFormat) {
      case 'markdown': {
        const markdown = formatPlanMarkdown(refinedPlan);
        if (options.outputFile) {
          const { mkdirSync, writeFileSync } = await import('node:fs');
          const { resolve } = await import('node:path');
          const outputPath = resolve(options.outputFile);
          mkdirSync(resolve(outputPath).replace(/[^/]+$/, ''), { recursive: true });
          writeFileSync(outputPath, markdown, 'utf-8');
          console.log(chalk.green(`Refined plan exported to: ${options.outputFile}`));
        } else {
          process.stdout.write(markdown);
        }
        break;
      }

      case 'json': {
        const json = JSON.stringify(refinedPlan, null, 2);
        if (options.outputFile) {
          const { mkdirSync, writeFileSync } = await import('node:fs');
          const { resolve } = await import('node:path');
          const outputPath = resolve(options.outputFile);
          mkdirSync(resolve(outputPath).replace(/[^/]+$/, ''), { recursive: true });
          writeFileSync(outputPath, json, 'utf-8');
          console.log(chalk.green(`Refined plan exported to: ${options.outputFile}`));
        } else {
          process.stdout.write(json);
        }
        break;
      }

      case 'terminal':
      default: {
        process.stdout.write(`${formatPlan(refinedPlan)}\n`);
        break;
      }
    }

    console.log(chalk.dim(`\nTask ID: ${taskId}`));
  } catch (error) {
    spinner.fail(chalk.red('Plan refinement failed'));
    if (error instanceof PlanGenerationError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}
