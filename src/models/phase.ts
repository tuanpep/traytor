import type { Plan } from './plan.js';
import type { Execution } from './execution.js';
import type { Verification } from './verification.js';

export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

/**
 * Accumulated context from previous phases that should be injected
 * into subsequent phase prompts.
 */
export interface PhaseContextCarryOver {
  /** Files created or modified by previous phases */
  filesChanged: string[];
  /** Key decisions made in previous phases */
  decisions: string[];
  /** Rationale and notes from previous phases */
  rationale: string[];
}

export interface Phase {
  id: string;
  name: string;
  description: string;
  status: PhaseStatus;
  /** 1-based order of this phase within the task */
  order: number;
  plan?: Plan;
  execution?: Execution;
  verification?: Verification;
  /** Context from completed previous phases */
  contextCarryOver?: PhaseContextCarryOver;
  createdAt: string;
  updatedAt: string;
}

export function createPhaseId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `phase_${now}_${random}`;
}
