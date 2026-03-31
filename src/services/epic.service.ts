import type { Task, TaskHistoryEntry } from '../models/task.js';
import type {
  Epic,
  Spec,
  Ticket,
  SpecType,
  TicketStatus,
  Workflow,
  WorkflowStep,
} from '../models/epic.js';
import { createSpecId, createTicketId, createWorkflowStepId } from '../models/epic.js';
import {
  TaskNotFoundError,
  EpicNotFoundError,
  SpecNotFoundError,
  TicketNotFoundError,
} from '../utils/errors.js';
import { TaskRepository } from '../data/repositories/task.repository.js';

export class EpicService {
  constructor(private readonly taskRepository: TaskRepository) {}

  // ─── Epic Task Methods ───────────────────────────────────────────────

  async createEpicTask(query: string, workingDir: string): Promise<Task> {
    void workingDir;
    const now = new Date().toISOString();
    const epic: Epic = {
      id: createEpicId(),
      specs: [],
      tickets: [],
      executions: [],
    };

    const task: Task = {
      id: createTaskId(),
      type: 'epic',
      query,
      status: 'pending',
      context: { files: [], folders: [] },
      epic,
      executions: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.taskRepository.save(task);
    return task;
  }

  async saveEpic(taskId: string, epic: Epic): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    task.epic = epic;
    task.updatedAt = new Date().toISOString();
    await this.taskRepository.save(task);
  }

  async getEpic(taskId: string): Promise<Epic> {
    const task = await this.taskRepository.findById(taskId);
    if (!task || !task.epic) {
      throw new EpicNotFoundError(taskId);
    }
    return task.epic;
  }

  async listEpics(): Promise<Task[]> {
    const tasks = await this.taskRepository.findAll();
    return tasks.filter((t) => t.type === 'epic');
  }

  async addHistory(taskId: string, action: string, details?: string): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const entry: TaskHistoryEntry = {
      timestamp: new Date().toISOString(),
      action,
      details,
    };
    task.history.push(entry);
    task.updatedAt = new Date().toISOString();
    await this.taskRepository.save(task);
  }

  // ─── Spec Methods ────────────────────────────────────────────────────

  async addSpec(
    taskId: string,
    spec: { type: SpecType; title: string; content: string }
  ): Promise<Spec> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }
    if (!task.epic) {
      throw new EpicNotFoundError(taskId);
    }

    const now = new Date().toISOString();
    const newSpec: Spec = {
      id: createSpecId(),
      type: spec.type,
      title: spec.title,
      content: spec.content,
      createdAt: now,
      updatedAt: now,
    };

    task.epic.specs.push(newSpec);
    task.updatedAt = now;
    task.history.push({
      timestamp: now,
      action: 'spec_added',
      details: `Spec "${spec.title}" (${spec.type}) added`,
    });
    await this.taskRepository.save(task);
    return newSpec;
  }

  async getSpec(taskId: string, specId: string): Promise<Spec> {
    const epic = await this.getEpic(taskId);
    const spec = epic.specs.find((s) => s.id === specId);
    if (!spec) {
      throw new SpecNotFoundError(specId, taskId);
    }
    return spec;
  }

  async listSpecs(taskId: string): Promise<Spec[]> {
    const epic = await this.getEpic(taskId);
    return epic.specs;
  }

  async updateSpec(
    taskId: string,
    specId: string,
    updates: Partial<Pick<Spec, 'title' | 'content' | 'type'>>
  ): Promise<Spec> {
    const task = await this.taskRepository.findById(taskId);
    if (!task || !task.epic) {
      throw new EpicNotFoundError(taskId);
    }

    const spec = task.epic.specs.find((s) => s.id === specId);
    if (!spec) {
      throw new SpecNotFoundError(specId, taskId);
    }

    if (updates.title !== undefined) spec.title = updates.title;
    if (updates.content !== undefined) spec.content = updates.content;
    if (updates.type !== undefined) spec.type = updates.type;
    spec.updatedAt = new Date().toISOString();

    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'spec_updated',
      details: `Spec "${spec.title}" updated`,
    });
    await this.taskRepository.save(task);
    return spec;
  }

  async deleteSpec(taskId: string, specId: string): Promise<boolean> {
    const task = await this.taskRepository.findById(taskId);
    if (!task || !task.epic) {
      throw new EpicNotFoundError(taskId);
    }

    const index = task.epic.specs.findIndex((s) => s.id === specId);
    if (index === -1) {
      throw new SpecNotFoundError(specId, taskId);
    }

    const removed = task.epic.specs.splice(index, 1)[0];

    // Remove spec references from tickets
    for (const ticket of task.epic.tickets) {
      ticket.linkedSpecs = ticket.linkedSpecs.filter((id) => id !== specId);
    }

    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'spec_deleted',
      details: `Spec "${removed.title}" deleted`,
    });
    await this.taskRepository.save(task);
    return true;
  }

  // ─── Ticket Methods ──────────────────────────────────────────────────

  async addTicket(
    taskId: string,
    ticket: {
      title: string;
      description: string;
      acceptanceCriteria: string[];
      linkedSpecs?: string[];
      assignee?: string;
    }
  ): Promise<Ticket> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }
    if (!task.epic) {
      throw new EpicNotFoundError(taskId);
    }

    // Validate linked specs exist
    if (ticket.linkedSpecs && ticket.linkedSpecs.length > 0) {
      const specIds = new Set(task.epic.specs.map((s) => s.id));
      for (const specId of ticket.linkedSpecs) {
        if (!specIds.has(specId)) {
          throw new SpecNotFoundError(specId, taskId);
        }
      }
    }

    const newTicket: Ticket = {
      id: createTicketId(),
      title: ticket.title,
      description: ticket.description,
      acceptanceCriteria: ticket.acceptanceCriteria,
      status: 'todo',
      linkedSpecs: ticket.linkedSpecs ?? [],
      assignee: ticket.assignee,
    };

    task.epic.tickets.push(newTicket);
    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'ticket_added',
      details: `Ticket "${ticket.title}" added`,
    });
    await this.taskRepository.save(task);
    return newTicket;
  }

  async getTicket(taskId: string, ticketId: string): Promise<Ticket> {
    const epic = await this.getEpic(taskId);
    const ticket = epic.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId, taskId);
    }
    return ticket;
  }

  async listTickets(taskId: string): Promise<Ticket[]> {
    const epic = await this.getEpic(taskId);
    return epic.tickets;
  }

  async updateTicketStatus(
    taskId: string,
    ticketId: string,
    status: TicketStatus
  ): Promise<Ticket> {
    const task = await this.taskRepository.findById(taskId);
    if (!task || !task.epic) {
      throw new EpicNotFoundError(taskId);
    }

    const ticket = task.epic.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId, taskId);
    }

    const previousStatus = ticket.status;
    ticket.status = status;

    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'ticket_status_changed',
      details: `Ticket "${ticket.title}" status: ${previousStatus} -> ${status}`,
    });
    await this.taskRepository.save(task);
    return ticket;
  }

  async updateTicket(
    taskId: string,
    ticketId: string,
    updates: Partial<
      Pick<Ticket, 'title' | 'description' | 'acceptanceCriteria' | 'assignee' | 'linkedSpecs'>
    >
  ): Promise<Ticket> {
    const task = await this.taskRepository.findById(taskId);
    if (!task || !task.epic) {
      throw new EpicNotFoundError(taskId);
    }

    const ticket = task.epic.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId, taskId);
    }

    if (updates.title !== undefined) ticket.title = updates.title;
    if (updates.description !== undefined) ticket.description = updates.description;
    if (updates.acceptanceCriteria !== undefined)
      ticket.acceptanceCriteria = updates.acceptanceCriteria;
    if (updates.assignee !== undefined) ticket.assignee = updates.assignee;
    if (updates.linkedSpecs !== undefined) ticket.linkedSpecs = updates.linkedSpecs;

    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'ticket_updated',
      details: `Ticket "${ticket.title}" updated`,
    });
    await this.taskRepository.save(task);
    return ticket;
  }

  async deleteTicket(taskId: string, ticketId: string): Promise<boolean> {
    const task = await this.taskRepository.findById(taskId);
    if (!task || !task.epic) {
      throw new EpicNotFoundError(taskId);
    }

    const index = task.epic.tickets.findIndex((t) => t.id === ticketId);
    if (index === -1) {
      throw new TicketNotFoundError(ticketId, taskId);
    }

    const removed = task.epic.tickets.splice(index, 1)[0];

    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'ticket_deleted',
      details: `Ticket "${removed.title}" deleted`,
    });
    await this.taskRepository.save(task);
    return true;
  }

  // ─── Workflow Methods ────────────────────────────────────────────────

  async setWorkflow(
    taskId: string,
    workflow: { name: string; steps: Omit<WorkflowStep, 'id'>[] }
  ): Promise<Workflow> {
    const task = await this.taskRepository.findById(taskId);
    if (!task || !task.epic) {
      throw new EpicNotFoundError(taskId);
    }

    const newWorkflow: Workflow = {
      name: workflow.name,
      steps: workflow.steps.map((step, i) => ({
        ...step,
        id: createWorkflowStepId(step.order ?? i + 1),
      })),
    };

    task.epic.workflow = newWorkflow;
    task.updatedAt = new Date().toISOString();
    task.history.push({
      timestamp: new Date().toISOString(),
      action: 'workflow_set',
      details: `Workflow "${workflow.name}" set with ${newWorkflow.steps.length} steps`,
    });
    await this.taskRepository.save(task);
    return newWorkflow;
  }
}

// Need to import createEpicId and createTaskId
import { createEpicId } from '../models/epic.js';
import { createTaskId } from '../models/task.js';
