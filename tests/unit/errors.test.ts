import { describe, expect, it } from 'vitest';

import {
  AgentExecutionError,
  PlanGenerationError,
  SDDError,
  TaskNotFoundError,
  VerificationError,
} from '../../src/utils/errors.js';

describe('SDDError hierarchy', () => {
  it('creates task not found error with code and details', () => {
    const error = new TaskNotFoundError('task_123');

    expect(error).toBeInstanceOf(SDDError);
    expect(error.code).toBe('TASK_NOT_FOUND');
    expect(error.details).toEqual({ taskId: 'task_123' });
    expect(error.suggestion).toContain('sdd history');
  });

  it('creates phase-specific errors with actionable metadata', () => {
    const planError = new PlanGenerationError('invalid template', { template: 'default' });
    const agentError = new AgentExecutionError('claude-code', 'command failed', { exitCode: 127 });
    const verifyError = new VerificationError('tests failed', { failedChecks: 2 });

    expect(planError.code).toBe('PLAN_GENERATION_FAILED');
    expect(agentError.code).toBe('AGENT_EXECUTION_FAILED');
    expect(verifyError.code).toBe('VERIFICATION_FAILED');
    expect(planError.details).toEqual({ template: 'default' });
    expect(agentError.details).toEqual({ exitCode: 127 });
    expect(verifyError.details).toEqual({ failedChecks: 2 });
  });
});
