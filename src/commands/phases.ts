import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import { formatPhases } from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import { PhaseGenerationError } from '../utils/errors.js';

export interface PhasesCommandOptions {
  files?: string[];
  output?: 'terminal' | 'markdown' | 'json';
}

/**
 * Create a multi-phase task and generate phases using the LLM.
 */
export async function runPhasesCommand(
  taskService: TaskService,
  query: string,
  options: PhasesCommandOptions = {}
): Promise<void> {
  const logger = getLogger();

  logger.info(`Starting phase generation for: "${query}"`);

  // 1. Create phases task
  const task = await taskService.createPhasesTask(query, process.cwd());
  logger.debug(`Task created: ${task.id}`);

  // 2. Generate phases with spinner
  const spinner = ora('Analyzing codebase and generating phases...').start();

  try {
    const phases = await taskService.generatePhases(task, options.files);

    spinner.succeed(chalk.green(`Generated ${phases.length} phases!`));

    // 3. Save phases to storage
    await taskService.savePhases(task.id, phases);

    // 4. Output the phases
    const outputFormat = options.output ?? 'terminal';

    switch (outputFormat) {
      case 'json': {
        console.log(JSON.stringify(phases, null, 2));
        break;
      }
      case 'terminal':
      default: {
        console.log('');
        console.log(formatPhases(phases));
        break;
      }
    }

    // Always show task ID and usage hints
    console.log(chalk.dim(`\nTask ID: ${task.id}`));
    console.log(chalk.dim(`\nNext steps:`));
    for (const phase of phases) {
      console.log(chalk.dim(`  sdd exec ${task.id} --phase ${phase.order}   # Execute phase ${phase.order}: ${phase.name}`));
    }
    console.log(chalk.dim(`  sdd verify ${task.id} --phase <n>  # Verify a specific phase`));
  } catch (error) {
    spinner.fail(chalk.red('Phase generation failed'));
    if (error instanceof PhaseGenerationError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}
