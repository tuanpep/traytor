import path from 'node:path';

import type { Task, TaskExecution } from '../../models/task.js';
import { createExecutionId } from '../../models/execution.js';
import { FileStorage } from '../storage/file-storage.js';

export class TaskRepository {
  private readonly storage: FileStorage<Task>;

  constructor(baseDir: string) {
    this.storage = new FileStorage<Task>(path.join(baseDir, 'tasks'));
  }

  async save(task: Task): Promise<void> {
    await this.storage.save(task.id, task);
  }

  async findById(taskId: string): Promise<Task | null> {
    return this.storage.load(taskId);
  }

  async findAll(): Promise<Task[]> {
    const tasks = await this.storage.list();
    return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(taskId: string): Promise<boolean> {
    return this.storage.delete(taskId);
  }

  async addExecution(taskId: string, execution: Omit<TaskExecution, 'id' | 'timestamp'>): Promise<Task> {
    const task = await this.findById(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }

    const fullExecution: TaskExecution = {
      ...execution,
      id: createExecutionId(),
      timestamp: new Date().toISOString(),
    };

    task.executions.push(fullExecution);
    task.updatedAt = new Date().toISOString();
    await this.save(task);
    return task;
  }
}
