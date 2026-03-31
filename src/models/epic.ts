import type { Execution } from './execution.js';

export interface Workflow {
  name: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  order: number;
}

export type SpecType = 'prd' | 'tech' | 'design' | 'api';

export interface Spec {
  id: string;
  type: SpecType;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus = 'todo' | 'in_progress' | 'done';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: TicketStatus;
  linkedSpecs: string[];
  assignee?: string;
}

export interface Epic {
  id: string;
  workflow?: Workflow;
  specs: Spec[];
  tickets: Ticket[];
  executions: Execution[];
}

export function createEpicId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `epic_${now}_${random}`;
}

export function createSpecId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `spec_${now}_${random}`;
}

export function createTicketId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `ticket_${now}_${random}`;
}

export function createWorkflowStepId(order: number): string {
  return `wf_step_${order}`;
}
