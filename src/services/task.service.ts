import type { Plan } from '../models/plan.js';
import type { Task } from '../models/task.js';
import { createPlanId, createPlanStepId } from '../models/plan.js';
import { createTaskId } from '../models/task.js';
import { TaskNotFoundError, PlanGenerationError } from '../utils/errors.js';
import { TaskRepository } from '../data/repositories/task.repository.js';
import type { PlanGenerator } from './plan-generator.js';

export class TaskService {
  private planGenerator?: PlanGenerator;

  constructor(
    private readonly taskRepository: TaskRepository,
    planGenerator?: PlanGenerator
  ) {
    this.planGenerator = planGenerator;
  }

  /** Set or replace the plan generator (needed for bootstrap) */
  setPlanGenerator(planGenerator: PlanGenerator): void {
    this.planGenerator = planGenerator;
  }

  async createPlanTask(query: string, _workingDir: string): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: createTaskId(),
      type: 'plan',
      query,
      status: 'pending',
      context: { files: [], folders: [] },
      executions: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.taskRepository.save(task);
    return task;
  }

  async generatePlan(task: Task, specificFiles?: string[]): Promise<Plan> {
    if (!this.planGenerator) {
      throw new PlanGenerationError(
        'Plan generator not configured',
        { suggestion: 'Ensure LLM service is properly initialized' }
      );
    }

    try {
      const plan = await this.planGenerator.generate(task.query, specificFiles);
      task.status = 'in_progress';
      task.updatedAt = new Date().toISOString();
      await this.taskRepository.save(task);
      return plan;
    } catch (error) {
      task.status = 'failed';
      task.updatedAt = new Date().toISOString();
      await this.taskRepository.save(task);

      if (error instanceof PlanGenerationError) throw error;
      throw new PlanGenerationError(
        error instanceof Error ? error.message : String(error),
        { taskId: task.id }
      );
    }
  }

  async savePlan(taskId: string, plan: Plan): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    task.plan = plan;
    task.status = 'completed';
    task.updatedAt = new Date().toISOString();
    await this.taskRepository.save(task);
  }

  async createDraftPlan(_task: Task): Promise<Plan> {
    return {
      id: createPlanId(),
      steps: [
        {
          id: createPlanStepId(0),
          title: 'Scaffold command, service, and data layers',
          description:
            'Set up CLI commands and repositories so plan workflow can persist and retrieve tasks.',
          files: [
            'src/bin/sdd.ts',
            'src/services/task.service.ts',
            'src/data/repositories/task.repository.ts',
          ],
        },
      ],
      rationale: 'Initial architecture scaffold for Phase 1.',
      iterations: [],
    };
  }

  async getTask(taskId: string): Promise<Task> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }
    return task;
  }

  async listTasks(): Promise<Task[]> {
    return this.taskRepository.findAll();
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.taskRepository.delete(taskId);
  }

  async addExecution(
    taskId: string,
    execution: { status: 'success' | 'failed'; agentId: string; stdout?: string; stderr?: string; exitCode?: number }
  ): Promise<Task> {
    return this.taskRepository.addExecution(taskId, execution);
  }
}
