import chalk from 'chalk';
import type { TaskService } from '../services/task.service.js';
import { formatTask } from '../ui/cli/formatter.js';

export interface TaskListOptions {
  status?: string;
  type?: string;
  limit?: number;
  output?: 'terminal' | 'json';
}

/**
 * List all tasks with optional filtering.
 */
export async function runTaskListCommand(
  taskService: TaskService,
  options: TaskListOptions = {}
): Promise<void> {
  let tasks = await taskService.listTasks();

  if (options.status) {
    tasks = tasks.filter((t) => t.status === options.status);
  }
  if (options.type) {
    tasks = tasks.filter((t) => t.type === options.type);
  }
  if (options.limit) {
    tasks = tasks.slice(0, options.limit);
  }

  if (tasks.length === 0) {
    if (options.output === 'json') {
      process.stdout.write('[]\n');
    } else {
      console.log('No tasks found.');
    }
    return;
  }

  if (options.output === 'json') {
    const jsonOutput = tasks.map((t) => ({
      id: t.id,
      type: t.type,
      query: t.query,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      phases: t.phases?.length ?? 0,
      executions: t.executions.length,
    }));
    process.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else {
    console.log(chalk.bold(`Tasks (${tasks.length}):`));
    console.log('');
    process.stdout.write(`${tasks.map(formatTask).join('\n')}\n`);
  }
}

export interface TaskShowOptions {
  output?: 'terminal' | 'json';
}

/**
 * Show detailed information about a specific task.
 */
export async function runTaskShowCommand(
  taskService: TaskService,
  taskId: string,
  options: TaskShowOptions = {}
): Promise<void> {
  let task;
  try {
    task = await taskService.getTask(taskId);
  } catch {
    console.error(chalk.red(`Task "${taskId}" not found.`));
    console.log(chalk.dim('Use `traytor history` to list all tasks.'));
    process.exit(1);
  }

  if (options.output === 'json') {
    process.stdout.write(`${JSON.stringify(task, null, 2)}\n`);
    return;
  }

  // Display task details
  const statusColor =
    task.status === 'completed'
      ? chalk.green
      : task.status === 'failed'
        ? chalk.red
        : task.status === 'in_progress'
          ? chalk.yellow
          : chalk.dim;

  console.log('');
  console.log(chalk.bold(task.query));
  console.log(chalk.dim('─'.repeat(Math.min(task.query.length, 60))));
  console.log('');
  console.log(`  ${chalk.bold('ID:')}        ${task.id}`);
  console.log(`  ${chalk.bold('Type:')}      ${task.type}`);
  console.log(`  ${chalk.bold('Status:')}    ${statusColor(task.status)}`);
  console.log(`  ${chalk.bold('Created:')}   ${task.createdAt}`);
  console.log(`  ${chalk.bold('Updated:')}   ${task.updatedAt}`);
  console.log(`  ${chalk.bold('Executions:')} ${task.executions.length}`);

  // Plan info
  if (task.plan) {
    console.log('');
    console.log(chalk.bold('  Plan:'));
    console.log(`    ${chalk.dim('ID:')}    ${task.plan.id}`);
    console.log(`    ${chalk.dim('Steps:')} ${task.plan.steps.length}`);
    if (task.plan.rationale) {
      console.log(`    ${chalk.dim('Rationale:')} ${task.plan.rationale.slice(0, 120)}${task.plan.rationale.length > 120 ? '...' : ''}`);
    }
    console.log('');
    task.plan.steps.forEach((step, i) => {
      console.log(`    ${chalk.dim(`${i + 1}.`)} ${step.title}`);
      if (step.files.length > 0) {
        console.log(chalk.dim(`       Files: ${step.files.join(', ')}`));
      }
    });
  }

  // Phases info
  if (task.phases && task.phases.length > 0) {
    console.log('');
    console.log(chalk.bold('  Phases:'));
    task.phases
      .sort((a, b) => a.order - b.order)
      .forEach((phase) => {
        const phaseStatus = phase.status === 'completed' ? chalk.green('done') : phase.status === 'in_progress' ? chalk.yellow('in progress') : phase.status === 'blocked' ? chalk.red('blocked') : chalk.dim('pending');
        console.log(`    ${chalk.dim(`${phase.order}.`)} ${phase.name} [${phaseStatus}]`);
      });
  }

  // Verification info
  if (task.verification) {
    const openComments = task.verification.comments?.filter((c) => c.status === 'open').length ?? 0;
    const totalComments = task.verification.comments?.length ?? 0;
    console.log('');
    console.log(chalk.bold('  Verification:'));
    console.log(`    ${chalk.dim('Comments:')} ${openComments} open / ${totalComments} total`);
  }

  // Recent executions
  if (task.executions.length > 0) {
    console.log('');
    console.log(chalk.bold('  Recent Executions:'));
    const recentExecs = task.executions.slice(-5).reverse();
    for (const exec of recentExecs) {
      const icon = exec.status === 'success' ? chalk.green('✓') : chalk.red('✗');
      console.log(`    ${icon} ${exec.agentId ?? 'unknown'} at ${exec.timestamp}`);
    }
  }

  console.log('');
}
