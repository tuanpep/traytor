import type { TaskService } from '../services/task.service.js';
import { formatTask } from '../ui/cli/formatter.js';

export interface HistoryCommandOptions {
  output?: 'terminal' | 'json';
  status?: string;
  type?: string;
  limit?: number;
}

export async function runHistoryCommand(
  taskService: TaskService,
  options: HistoryCommandOptions = {}
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
      process.stdout.write('No tasks found.\n');
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
    }));
    process.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else {
    process.stdout.write(`${tasks.map(formatTask).join('\n')}\n`);
  }
}
