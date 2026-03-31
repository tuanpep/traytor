import type { TaskService } from '../services/task.service.js';
import { runTUI } from '../ui/tui/index.js';

export async function runTUICommand(taskService: TaskService): Promise<void> {
  await runTUI(taskService);
}
