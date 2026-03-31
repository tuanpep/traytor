export type WorkflowStepCommand = 'plan' | 'exec' | 'verify' | 'complete' | 'custom';

export type WorkflowStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type WorkflowStatus = 'in_progress' | 'completed' | 'paused';

export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: WorkflowStepDefinition[];
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  description: string;
  order: number;
  command: WorkflowStepCommand;
  customCommand?: string;
  required: boolean;
}

export interface WorkflowState {
  workflowId: string;
  definition: WorkflowDefinition;
  taskId: string;
  currentStepIndex: number;
  stepStates: WorkflowStepState[];
  status: WorkflowStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkflowStepState {
  stepId: string;
  status: WorkflowStepStatus;
  startedAt?: string;
  completedAt?: string;
  result?: string;
}

export interface WorkflowDefinitionFile {
  name: string;
  description?: string;
  steps: {
    name: string;
    description?: string;
    command?: string;
    customCommand?: string;
    required?: boolean;
  }[];
}

export function createWorkflowId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `wf_${now}_${random}`;
}

export function createWorkflowStepDefId(order: number): string {
  return `wf_step_def_${order}`;
}

export const DEFAULT_WORKFLOW: WorkflowDefinition = {
  name: 'default',
  description: 'Default workflow: Plan → Execute → Verify → Complete',
  steps: [
    {
      id: createWorkflowStepDefId(1),
      name: 'Plan',
      description: 'Generate an implementation plan for the task',
      order: 1,
      command: 'plan',
      required: true,
    },
    {
      id: createWorkflowStepDefId(2),
      name: 'Execute',
      description: 'Execute the plan using an AI agent',
      order: 2,
      command: 'exec',
      required: true,
    },
    {
      id: createWorkflowStepDefId(3),
      name: 'Verify',
      description: 'Verify the implementation against the plan',
      order: 3,
      command: 'verify',
      required: true,
    },
    {
      id: createWorkflowStepDefId(4),
      name: 'Complete',
      description: 'Mark the task as completed',
      order: 4,
      command: 'complete',
      required: true,
    },
  ],
};
