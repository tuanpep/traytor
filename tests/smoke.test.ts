import { describe, expect, it } from 'vitest';

import {
  createTaskId,
} from '../src/models/task.js';
import {
  createPlanId,
  createPlanStepId,
} from '../src/models/plan.js';
import {
  createEpicId,
  createSpecId,
  createTicketId,
  createWorkflowStepId,
} from '../src/models/epic.js';
import {
  createPhaseId,
} from '../src/models/phase.js';
import {
  createExecutionId,
} from '../src/models/execution.js';
import {
  createVerificationId,
  createVerificationCommentId,
} from '../src/models/verification.js';
import {
  createReviewId,
  createReviewCommentId,
} from '../src/models/review.js';
import {
  createWorkflowId,
  createWorkflowStepDefId,
} from '../src/models/workflow.js';
import {
  TraytorError,
  ErrorCode,
  TaskNotFoundError,
  PlanGenerationError,
  AgentExecutionError,
  VerificationError,
  LLMProviderError,
  WorkflowError,
} from '../src/utils/errors.js';

describe('smoke test', () => {
  it('generates unique task IDs', () => {
    const id = createTaskId(1000);
    expect(id).toMatch(/^task_1000_[a-z0-9]+$/);
  });

  it('generates unique plan IDs', () => {
    const id = createPlanId(1000);
    expect(id).toMatch(/^plan_1000_[a-z0-9]+$/);
  });

  it('generates plan step IDs with correct index', () => {
    expect(createPlanStepId(0)).toBe('step_1');
    expect(createPlanStepId(4)).toBe('step_5');
  });

  it('generates unique epic, spec, and ticket IDs', () => {
    expect(createEpicId(1000)).toMatch(/^epic_1000_[a-z0-9]+$/);
    expect(createSpecId(1000)).toMatch(/^spec_1000_[a-z0-9]+$/);
    expect(createTicketId(1000)).toMatch(/^ticket_1000_[a-z0-9]+$/);
    expect(createWorkflowStepId(3)).toBe('wf_step_3');
  });

  it('generates unique phase and execution IDs', () => {
    expect(createPhaseId(1000)).toMatch(/^phase_1000_[a-z0-9]+$/);
    expect(createExecutionId(1000)).toMatch(/^exec_1000_[a-z0-9]+$/);
  });

  it('generates unique verification and review IDs', () => {
    expect(createVerificationId(1000)).toMatch(/^verif_1000_[a-z0-9]+$/);
    expect(createVerificationCommentId()).toMatch(/^vcomment_\d+_[a-z0-9]+$/);
    expect(createReviewId(1000)).toMatch(/^review_1000_[a-z0-9]+$/);
    expect(createReviewCommentId()).toMatch(/^rcomment_\d+_[a-z0-9]+$/);
  });

  it('generates unique workflow IDs', () => {
    expect(createWorkflowId(1000)).toMatch(/^wf_1000_[a-z0-9]+$/);
    expect(createWorkflowStepDefId(2)).toBe('wf_step_def_2');
  });

  it('TraytorError base class works correctly', () => {
    const err = new TraytorError(
      ErrorCode.TASK_NOT_FOUND,
      'test message',
      'test suggestion',
      { key: 'value' }
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TraytorError);
    expect(err.code).toBe(ErrorCode.TASK_NOT_FOUND);
    expect(err.message).toBe('test message');
    expect(err.suggestion).toBe('test suggestion');
    expect(err.details).toEqual({ key: 'value' });
    expect(err.toString()).toContain('[TASK_NOT_FOUND]');
  });

  it('TaskNotFoundError extends TraytorError with correct properties', () => {
    const err = new TaskNotFoundError('task_123');
    expect(err).toBeInstanceOf(TraytorError);
    expect(err.code).toBe(ErrorCode.TASK_NOT_FOUND);
    expect(err.message).toContain('task_123');
    expect(err.details).toEqual({ taskId: 'task_123' });
  });

  it('PlanGenerationError includes reason and details', () => {
    const err = new PlanGenerationError('LLM timeout', { model: 'claude-3' });
    expect(err).toBeInstanceOf(TraytorError);
    expect(err.code).toBe(ErrorCode.PLAN_GENERATION_FAILED);
    expect(err.message).toContain('LLM timeout');
    expect(err.details).toEqual({ model: 'claude-3' });
  });

  it('AgentExecutionError captures agent name', () => {
    const err = new AgentExecutionError('claude-code', 'process exited 1');
    expect(err).toBeInstanceOf(TraytorError);
    expect(err.message).toContain('claude-code');
  });

  it('VerificationError extends TraytorError', () => {
    const err = new VerificationError('coverage below threshold');
    expect(err).toBeInstanceOf(TraytorError);
    expect(err.code).toBe(ErrorCode.VERIFICATION_FAILED);
  });

  it('LLMProviderError detects auth errors and adjusts suggestion', () => {
    const authErr = new LLMProviderError('anthropic', 'invalid api key');
    expect(authErr.suggestion).toContain('ANTHROPIC_API_KEY');

    const otherErr = new LLMProviderError('openai', 'rate limited');
    expect(otherErr.suggestion).not.toContain('OPENAI_API_KEY');
  });

  it('WorkflowError and subtypes extend TraytorError', () => {
    const wfErr = new WorkflowError('invalid transition');
    expect(wfErr).toBeInstanceOf(TraytorError);
    expect(wfErr.code).toBe(ErrorCode.WORKFLOW_ERROR);
  });
});
