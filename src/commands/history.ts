import type { TaskService } from '../services/task.service.js';
import { formatTask } from '../ui/cli/formatter.js';

export async function runHistoryCommand(taskService: TaskService): Promise<void> {
  const tasks = await taskService.listTasks();
  if (tasks.length === 0) {
    process.stdout.write('No tasks found.\n');
    return;
  }

  process.stdout.write(`${tasks.map(formatTask).join('\n')}\n`);
}
