import type { Plan } from './plan.js';
import type { Execution } from './execution.js';
import type { Verification } from './verification.js';

export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface Phase {
  id: string;
  name: string;
  description: string;
  status: PhaseStatus;
  plan?: Plan;
  execution?: Execution;
  verification?: Verification;
}

export function createPhaseId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `phase_${now}_${random}`;
}
