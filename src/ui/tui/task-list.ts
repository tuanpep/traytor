import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Task, TaskStatus, TaskType } from '../../models/task.js';
import { fuzzyFilter, highlightMatches } from './fuzzy-search.js';

export interface TaskListFilter {
  status?: TaskStatus;
  type?: TaskType;
  search?: string;
}

export interface TaskListItem {
  id: string;
  label: string;
  status: TaskStatus;
  type: TaskType;
  query: string;
  createdAt: string;
  updatedAt: string;
  task: Task;
}

export function tasksToListItems(tasks: Task[]): TaskListItem[] {
  return tasks.map((task) => ({
    id: task.id,
    label: task.query,
    status: task.status,
    type: task.type,
    query: task.query,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    task,
  }));
}

export function filterTasks(items: TaskListItem[], filter: TaskListFilter): TaskListItem[] {
  let filtered = items;

  if (filter.status) {
    filtered = filtered.filter((item) => item.status === filter.status);
  }

  if (filter.type) {
    filtered = filtered.filter((item) => item.type === filter.type);
  }

  if (filter.search) {
    const results = fuzzyFilter(filtered, filter.search);
    return results;
  }

  return filtered;
}

export function renderTaskList(items: TaskListItem[], selectedIdx?: number): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan(`  Tasks (${items.length})`));
  lines.push(chalk.dim('  ' + '─'.repeat(40)));
  lines.push('');

  if (items.length === 0) {
    lines.push(chalk.dim('  No tasks found.'));
    return lines.join('\n');
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const statusColor =
      item.status === 'completed' ? chalk.green :
      item.status === 'in_progress' ? chalk.yellow :
      item.status === 'failed' ? chalk.red :
      chalk.gray;

    const typeIcon = item.type === 'plan' ? 'P' : item.type === 'phases' ? 'H' : item.type === 'review' ? 'R' : 'E';

    const isSelected = i === selectedIdx;
    const prefix = isSelected ? chalk.cyan('> ') : '  ';

    const statusStr = statusColor(`[${item.status.padEnd(11)}]`);
    const queryStr = item.query.length > 50 ? item.query.slice(0, 50) + '...' : item.query;
    const dateStr = chalk.dim(item.createdAt.split('T')[0]);

    lines.push(`${prefix}${statusStr} ${chalk.dim(typeIcon)} ${queryStr}  ${dateStr}`);
  }

  lines.push('');
  lines.push(chalk.dim('  ─'.repeat(20)));
  lines.push(chalk.dim('  [f] Filter  [s] Search  [Enter] Details  [b] Back  [q] Quit'));

  return lines.join('\n');
}

export async function promptTaskSearch(): Promise<{ action: 'search'; query: string } | { action: 'filter' } | { action: 'cancel' }> {
  const { input } = await inquirer.prompt([{
    type: 'input',
    name: 'input',
    message: 'Search or filter tasks (type to search, /status or /type to filter):',
    prefix: chalk.cyan('?'),
  }]);

  if (!input.trim()) return { action: 'cancel' };

  if (input.startsWith('/')) {
    return { action: 'filter' };
  }

  return { action: 'search', query: input.trim() };
}

export async function promptTaskSelection(tasks: Task[]): Promise<Task | null> {
  if (tasks.length === 0) {
    return null;
  }

  const choices = tasks.map((task) => {
    const statusIcon = task.status === 'completed' ? chalk.green('[v]') :
      task.status === 'in_progress' ? chalk.yellow('[>]') :
      task.status === 'failed' ? chalk.red('[x]') :
      chalk.gray('[o]');

    const typeIcon = task.type === 'plan' ? 'P' : task.type === 'phases' ? 'H' : task.type === 'review' ? 'R' : 'E';
    const truncated = task.query.length > 60 ? task.query.slice(0, 60) + '...' : task.query;

    return {
      name: `${statusIcon} ${chalk.dim(typeIcon)} ${truncated}  ${chalk.dim(task.createdAt.split('T')[0])}`,
      value: task,
      short: task.query.slice(0, 30),
    };
  });

  const { selected } = await inquirer.prompt([{
    type: 'select',
    name: 'selected',
    message: 'Select a task:',
    choices,
    pageSize: 15,
  }]);

  return selected;
}

export function renderHighlightedTaskList(
  items: TaskListItem[],
  searchQuery: string
): string {
  if (!searchQuery) return renderTaskList(items);

  const results = fuzzyFilter(items, searchQuery);
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan(`  Tasks matching "${searchQuery}" (${results.length} results)`));
  lines.push(chalk.dim('  ' + '─'.repeat(40)));
  lines.push('');

  if (results.length === 0) {
    lines.push(chalk.dim('  No tasks match your search.'));
    return lines.join('\n');
  }

  for (const item of results) {
    const statusColor =
      item.status === 'completed' ? chalk.green :
      item.status === 'in_progress' ? chalk.yellow :
      item.status === 'failed' ? chalk.red :
      chalk.gray;

    const typeIcon = item.type === 'plan' ? 'P' : item.type === 'phases' ? 'H' : item.type === 'review' ? 'R' : 'E';

    const highlighted = highlightMatches(item.query, item._matchPositions, chalk.cyan.bold);
    const statusStr = statusColor(`[${item.status.padEnd(11)}]`);

    lines.push(`  ${statusStr} ${chalk.dim(typeIcon)} ${highlighted}  ${chalk.dim(item.createdAt.split('T')[0])}`);
  }

  lines.push('');
  lines.push(chalk.dim('  [Enter] Details  [Esc] Clear search  [q] Quit'));

  return lines.join('\n');
}
