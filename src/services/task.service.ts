import type { Plan } from '../models/plan.js';
import type { Task } from '../models/task.js';
import type { Phase, PhaseStatus } from '../models/phase.js';
import type { Review } from '../models/review.js';
import type { Verification } from '../models/verification.js';
import { createTaskId } from '../models/task.js';
import {
  TaskNotFoundError,
  PlanGenerationError,
  TraytorError,
  ErrorCode,
  PhaseNotFoundError,
  PhaseGenerationError,
  VerificationError,
} from '../utils/errors.js';
import { TaskRepository } from '../data/repositories/task.repository.js';
import type { PlanGenerator } from './plan-generator.js';
import type { PhaseGenerator } from './phase-generator.js';
import { buildContextCarryOver } from './phase-generator.js';

export class TaskService {
  private planGenerator?: PlanGenerator;
  private phaseGenerator?: PhaseGenerator;

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

  /** Set or replace the phase generator */
  setPhaseGenerator(phaseGenerator: PhaseGenerator): void {
    this.phaseGenerator = phaseGenerator;
  }

  async createPlanTask(query: string, workingDir: string): Promise<Task> {
    void workingDir;
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

    return task;
  }

  async generatePlan(task: Task, specificFiles?: string[]): Promise<Plan> {
    if (!this.planGenerator) {
      throw new PlanGenerationError('Plan generator not configured', {
        suggestion: 'Ensure LLM service is properly initialized',
      });
    }

    const plan = await this.planGenerator.generate(task.query, specificFiles);
    task.plan = plan;
    task.status = 'completed';
    task.updatedAt = new Date().toISOString();
    await this.taskRepository.save(task);
    return plan;
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

  async saveTask(task: Task): Promise<void> {
    await this.taskRepository.save(task);
  }

  async addExecution(
    taskId: string,
    execution: {
      status: 'success' | 'failed';
      agentId: string;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    }
  ): Promise<Task> {
    return this.taskRepository.addExecution(taskId, execution);
  }

  // ─── Review Task Methods ───────────────────────────────────────────────

  async createReviewTask(query: string, workingDir: string): Promise<Task> {
    void workingDir;
    const now = new Date().toISOString();
    const task: Task = {
      id: createTaskId(),
      type: 'review',
      query,
      status: 'pending',
      context: { files: [], folders: [] },
      executions: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    return task;
  }

  async saveReview(taskId: string, review: Review): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    review.taskId = taskId;
    task.review = review;
    task.status = 'completed';
    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'review_completed',
      details: `Review ${review.id} saved with ${review.summary.totalComments} findings`,
    });
    await this.taskRepository.save(task);
  }

  async getReview(taskId: string): Promise<Review | undefined> {
    const task = await this.taskRepository.findById(taskId);
    return task?.review;
  }

  // ─── Verification Methods ───────────────────────────────────────────────

  async saveVerification(taskId: string, verification: Verification): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    verification.taskId = taskId;
    task.verification = verification;
    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'verification_completed',
      details: `Verification ${verification.id} saved with ${verification.comments.length} comments`,
    });
    await this.taskRepository.save(task);
  }

  async getVerification(taskId: string): Promise<Verification | undefined> {
    const task = await this.taskRepository.findById(taskId);
    return task?.verification;
  }

  async updateVerificationCommentStatus(
    taskId: string,
    commentId: string,
    status: 'open' | 'fixed' | 'ignored'
  ): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    if (!task.verification) {
      throw new VerificationError(`Task "${taskId}" has no verification to update`);
    }

    const comment = task.verification.comments.find((c) => c.id === commentId);
    if (!comment) {
      throw new VerificationError(
        `Comment "${commentId}" not found in verification for task "${taskId}"`
      );
    }

    comment.status = status;
    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'verification_comment_updated',
      details: `Comment ${commentId} status: ${status}`,
    });
    await this.taskRepository.save(task);
  }

  // ─── Phases Task Methods ───────────────────────────────────────────────

  /**
   * Create a new multi-phase task.
   */
  async createPhasesTask(query: string, workingDir: string): Promise<Task> {
    void workingDir;
    const now = new Date().toISOString();
    const task: Task = {
      id: createTaskId(),
      type: 'phases',
      query,
      status: 'pending',
      context: { files: [], folders: [] },
      phases: [],
      executions: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    return task;
  }

  /**
   * Generate phases for a task using the LLM.
   */
  async generatePhases(task: Task, specificFiles?: string[]): Promise<Phase[]> {
    if (!this.phaseGenerator) {
      throw new PhaseGenerationError('Phase generator not configured', {
        suggestion: 'Ensure LLM service is properly initialized',
      });
    }

    const phases = await this.phaseGenerator.generate(task.query, specificFiles, task.phases);
    task.phases = phases;
    task.status = 'completed';
    task.updatedAt = new Date().toISOString();
    await this.taskRepository.save(task);
    return phases;
  }

  /**
   * Save phases to a task.
   */
  async savePhases(taskId: string, phases: Phase[]): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    task.phases = phases;
    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'phases_generated',
      details: `${phases.length} phases generated`,
    });
    await this.taskRepository.save(task);
  }

  /**
   * Get a specific phase by 1-based order number.
   */
  getPhase(task: Task, phaseOrder: number): Phase {
    if (!task.phases || task.phases.length === 0) {
      throw new PhaseNotFoundError(`phase-${phaseOrder}`, task.id);
    }

    const phase = task.phases.find((p) => p.order === phaseOrder);
    if (!phase) {
      throw new PhaseNotFoundError(`phase-${phaseOrder}`, task.id);
    }

    return phase;
  }

  /**
   * Update the status of a specific phase.
   */
  async updatePhaseStatus(taskId: string, phaseOrder: number, status: PhaseStatus): Promise<Phase> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    if (!task.phases) {
      throw new TraytorError(
        ErrorCode.TASK_NOT_FOUND,
        `Task "${taskId}" has no phases`,
        'Create phases first using phases:add command'
      );
    }

    const phase = this.getPhase(task, phaseOrder);
    const previousStatus = phase.status;
    phase.status = status;
    phase.updatedAt = new Date().toISOString();

    // Build context carry-over from all completed phases before this one
    const completedBefore = task
      .phases!.filter((p) => p.status === 'completed' && p.order < phaseOrder)
      .sort((a, b) => a.order - b.order);
    phase.contextCarryOver = buildContextCarryOver(completedBefore);

    // Update task status based on phases
    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'phase_status_changed',
      details: `Phase ${phaseOrder} status: ${previousStatus} -> ${status}`,
    });
    await this.taskRepository.save(task);

    return phase;
  }

  /**
   * Save a plan to a specific phase.
   */
  async savePhasePlan(taskId: string, phaseOrder: number, plan: Plan): Promise<Phase> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const phase = this.getPhase(task, phaseOrder);
    phase.plan = plan;
    phase.updatedAt = new Date().toISOString();

    await this.taskRepository.save(task);
    return phase;
  }

  /**
   * Save a verification result to a specific phase.
   */
  async savePhaseVerification(
    taskId: string,
    phaseOrder: number,
    verification: NonNullable<Phase['verification']>
  ): Promise<Phase> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const phase = this.getPhase(task, phaseOrder);
    phase.verification = verification;
    phase.updatedAt = new Date().toISOString();

    await this.taskRepository.save(task);
    return phase;
  }

  /**
   * Insert a new phase at a specific position.
   */
  async insertPhase(taskId: string, phase: Phase, insertAfterOrder: number): Promise<Phase[]> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    if (!task.phases) {
      task.phases = [];
    }

    // Shift orders of phases after the insertion point
    for (const p of task.phases) {
      if (p.order > insertAfterOrder) {
        p.order += 1;
      }
    }

    // Set the new phase's order
    phase.order = insertAfterOrder + 1;
    phase.createdAt = new Date().toISOString();
    phase.updatedAt = new Date().toISOString();

    task.phases.push(phase);
    task.phases.sort((a, b) => a.order - b.order);

    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'phase_inserted',
      details: `Phase "${phase.name}" inserted after phase ${insertAfterOrder}`,
    });

    await this.taskRepository.save(task);
    return task.phases;
  }

  /**
   * Add a new phase at the end of the phase list.
   */
  async addPhase(taskId: string, phase: Phase): Promise<Phase[]> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    if (!task.phases) {
      task.phases = [];
    }

    const maxOrder = task.phases.reduce((max, p) => Math.max(max, p.order), 0);
    phase.order = maxOrder + 1;
    phase.createdAt = new Date().toISOString();
    phase.updatedAt = new Date().toISOString();

    task.phases.push(phase);

    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'phase_added',
      details: `Phase "${phase.name}" added at position ${phase.order}`,
    });

    await this.taskRepository.save(task);
    return task.phases;
  }

  /**
   * Reorder phases by providing a new ordering of phase IDs.
   */
  async reorderPhases(taskId: string, phaseIds: string[]): Promise<Phase[]> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    if (!task.phases) {
      throw new PhaseGenerationError('Task has no phases to reorder', { taskId });
    }

    // Validate all IDs exist
    const phaseMap = new Map(task.phases.map((p) => [p.id, p]));
    for (const id of phaseIds) {
      if (!phaseMap.has(id)) {
        throw new PhaseNotFoundError(id, taskId);
      }
    }

    // Validate all phases are accounted for
    if (phaseIds.length !== task.phases.length) {
      throw new PhaseGenerationError(
        `Expected ${task.phases.length} phase IDs but got ${phaseIds.length}`,
        { taskId }
      );
    }

    // Apply new ordering
    for (let i = 0; i < phaseIds.length; i++) {
      const phase = phaseMap.get(phaseIds[i])!;
      phase.order = i + 1;
      phase.updatedAt = new Date().toISOString();
    }

    task.phases.sort((a, b) => a.order - b.order);
    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'phases_reordered',
      details: `${phaseIds.length} phases reordered`,
    });

    await this.taskRepository.save(task);
    return task.phases;
  }

  /**
   * Get context carry-over from all completed phases preceding the given phase order.
   */
  getContextCarryOver(task: Task, phaseOrder: number): Phase['contextCarryOver'] {
    if (!task.phases) return undefined;

    const completedBefore = task.phases
      .filter((p) => p.status === 'completed' && p.order < phaseOrder)
      .sort((a, b) => a.order - b.order);

    if (completedBefore.length === 0) return undefined;

    return buildContextCarryOver(completedBefore);
  }
}
