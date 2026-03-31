import chalk from 'chalk';
import ora from 'ora';
import type { TaskService } from '../services/task.service.js';
import { formatPhases } from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import { PhaseGenerationError } from '../utils/errors.js';
import type { Phase } from '../models/phase.js';

export interface PhasesCommandOptions {
  files?: string[];
  output?: 'terminal' | 'markdown' | 'json';
}

export interface PhaseManagementOptions {
  name?: string;
  description?: string;
  insertAfter?: number;
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
      console.log(
        chalk.dim(
          `  sdd exec ${task.id} --phase ${phase.order}   # Execute phase ${phase.order}: ${phase.name}`
        )
      );
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

// ─── Phase Management Commands ──────────────────────────────────────────────

export async function runPhasesListCommand(
  taskService: TaskService,
  taskId: string
): Promise<void> {
  const task = await taskService.getTask(taskId);

  if (task.type !== 'phases' || !task.phases) {
    console.error(chalk.red(`Task "${taskId}" is not a phases task.`));
    return;
  }

  console.log(chalk.bold(`\nPhases for task: ${chalk.cyan(taskId)}\n`));
  console.log(formatPhases(task.phases));
}

export async function runPhaseAddCommand(
  taskService: TaskService,
  taskId: string,
  options: PhaseManagementOptions
): Promise<void> {
  const task = await taskService.getTask(taskId);

  if (task.type !== 'phases') {
    console.error(chalk.red(`Task "${taskId}" is not a phases task.`));
    return;
  }

  if (!options.name) {
    console.error(chalk.red('--name is required for adding a phase.'));
    return;
  }

  const newPhase: Phase = {
    id: `phase_${Date.now()}`,
    name: options.name,
    description: options.description ?? '',
    order: task.phases?.length ? task.phases.length + 1 : 1,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const phases = await taskService.addPhase(taskId, newPhase);

  console.log(chalk.green(`\n✓ Phase "${options.name}" added.\n`));
  console.log(formatPhases(phases));
}

export async function runPhaseInsertCommand(
  taskService: TaskService,
  taskId: string,
  options: PhaseManagementOptions
): Promise<void> {
  const task = await taskService.getTask(taskId);

  if (task.type !== 'phases') {
    console.error(chalk.red(`Task "${taskId}" is not a phases task.`));
    return;
  }

  if (!options.name) {
    console.error(chalk.red('--name is required for inserting a phase.'));
    return;
  }

  if (!options.insertAfter || options.insertAfter < 0) {
    console.error(chalk.red('--insert-after is required and must be a positive number.'));
    return;
  }

  const newPhase: Phase = {
    id: `phase_${Date.now()}`,
    name: options.name,
    description: options.description ?? '',
    order: 0,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const phases = await taskService.insertPhase(taskId, newPhase, options.insertAfter);

  console.log(
    chalk.green(`\n✓ Phase "${options.name}" inserted after phase ${options.insertAfter}.\n`)
  );
  console.log(formatPhases(phases));
}

export async function runPhaseReorderCommand(
  taskService: TaskService,
  taskId: string,
  phaseIds: string[]
): Promise<void> {
  const task = await taskService.getTask(taskId);

  if (task.type !== 'phases' || !task.phases) {
    console.error(chalk.red(`Task "${taskId}" is not a phases task.`));
    return;
  }

  if (phaseIds.length !== task.phases.length) {
    console.error(
      chalk.red(`Phase count mismatch: provided ${phaseIds.length}, expected ${task.phases.length}`)
    );
    return;
  }

  const phases = await taskService.reorderPhases(taskId, phaseIds);

  console.log(chalk.green(`\n✓ Phases reordered.\n`));
  console.log(formatPhases(phases));
}

export async function runPhaseDeleteCommand(
  taskService: TaskService,
  taskId: string,
  phaseOrder: number
): Promise<void> {
  const task = await taskService.getTask(taskId);

  if (task.type !== 'phases' || !task.phases) {
    console.error(chalk.red(`Task "${taskId}" is not a phases task.`));
    return;
  }

  const phaseToDelete = task.phases.find((p) => p.order === phaseOrder);
  if (!phaseToDelete) {
    console.error(chalk.red(`Phase ${phaseOrder} not found.`));
    return;
  }

  const updatedPhases = task.phases.filter((p) => p.order !== phaseOrder);
  const reorderedPhases = updatedPhases.map((p, index) => ({
    ...p,
    order: index + 1,
  }));

  await taskService.reorderPhases(
    taskId,
    reorderedPhases.map((p) => p.id)
  );

  console.log(chalk.green(`\n✓ Phase "${phaseToDelete.name}" deleted.\n`));
  console.log(formatPhases(reorderedPhases));
}
