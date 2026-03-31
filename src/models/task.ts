import type { Plan } from './plan.js';
import type { Phase } from './phase.js';
import type { Review } from './review.js';
import type { Epic } from './epic.js';
import type { Verification } from './verification.js';

export type TaskType = 'plan' | 'phases' | 'review' | 'epic';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TaskContext {
  files: string[];
  folders: string[];
  gitRef?: string;
  images?: string[];
  source?: 'github' | 'gitlab' | 'manual';
  repo?: string;
  issueNumber?: number;
  issueUrl?: string;
}

export interface TaskHistoryEntry {
  timestamp: string;
  action: string;
  details?: string;
}

export interface TaskExecution {
  id: string;
  timestamp: string;
  status: 'success' | 'failed';
  agentId: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface TaskUsage {
  planInputTokens: number;
  planOutputTokens: number;
  verifyInputTokens: number;
  verifyOutputTokens: number;
  reviewInputTokens: number;
  reviewOutputTokens: number;
}

export interface Task {
  id: string;
  type: TaskType;
  query: string;
  status: TaskStatus;
  context: TaskContext;
  plan?: Plan;
  phases?: Phase[];
  review?: Review;
  epic?: Epic;
  verification?: Verification;
  usage?: TaskUsage;
  executions: TaskExecution[];
  history: TaskHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export function createTaskId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `task_${now}_${random}`;
}
