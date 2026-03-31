import { describe, expect, it } from 'vitest';

import {
  createTaskId,
  createPlanId,
  createPlanStepId,
  createPlanIterationId,
  createVerificationId,
  createVerificationCommentId,
  createPhaseId,
  createReviewId,
  createExecutionId,
  createEpicId,
  createSpecId,
  createTicketId,
  createWorkflowStepId,
  createSymbolReferenceId,
} from '../src/models/index.js';

describe('ID generation', () => {
  it('createTaskId produces task_{timestamp}_{random} format', () => {
    const now = 1700000000000;
    const id = createTaskId(now);
    expect(id).toMatch(/^task_1700000000000_\w{6}$/);
  });

  it('createTaskId defaults to current time', () => {
    const id = createTaskId();
    expect(id).toMatch(/^task_\d+_\w{6}$/);
  });

  it('createPlanId produces plan_{timestamp}_{random} format', () => {
    const id = createPlanId(1700000000000);
    expect(id).toMatch(/^plan_1700000000000_\w{6}$/);
  });

  it('createPlanStepId produces step_{index} format', () => {
    expect(createPlanStepId(0)).toBe('step_1');
    expect(createPlanStepId(4)).toBe('step_5');
  });

  it('createPlanIterationId produces iter_{timestamp}_{random} format', () => {
    const id = createPlanIterationId(1700000000000);
    expect(id).toMatch(/^iter_1700000000000_\w{6}$/);
  });

  it('createVerificationId produces verif_{timestamp}_{random} format', () => {
    const id = createVerificationId(1700000000000);
    expect(id).toMatch(/^verif_1700000000000_\w{6}$/);
  });

  it('createVerificationCommentId produces vcomment_{timestamp}_{random} format', () => {
    const id = createVerificationCommentId();
    expect(id).toMatch(/^vcomment_\d+_\w{6}$/);
  });

  it('createPhaseId produces phase_{timestamp}_{random} format', () => {
    const id = createPhaseId(1700000000000);
    expect(id).toMatch(/^phase_1700000000000_\w{6}$/);
  });

  it('createReviewId produces review_{timestamp}_{random} format', () => {
    const id = createReviewId(1700000000000);
    expect(id).toMatch(/^review_1700000000000_\w{6}$/);
  });

  it('createExecutionId produces exec_{timestamp}_{random} format', () => {
    const id = createExecutionId(1700000000000);
    expect(id).toMatch(/^exec_1700000000000_\w{6}$/);
  });

  it('createEpicId produces epic_{timestamp}_{random} format', () => {
    const id = createEpicId(1700000000000);
    expect(id).toMatch(/^epic_1700000000000_\w{6}$/);
  });

  it('createSpecId produces spec_{timestamp}_{random} format', () => {
    const id = createSpecId(1700000000000);
    expect(id).toMatch(/^spec_1700000000000_\w{6}$/);
  });

  it('createTicketId produces ticket_{timestamp}_{random} format', () => {
    const id = createTicketId(1700000000000);
    expect(id).toMatch(/^ticket_1700000000000_\w{6}$/);
  });

  it('createWorkflowStepId produces wf_step_{order} format', () => {
    expect(createWorkflowStepId(1)).toBe('wf_step_1');
    expect(createWorkflowStepId(10)).toBe('wf_step_10');
  });

  it('createSymbolReferenceId sanitizes special characters', () => {
    const id = createSymbolReferenceId('my-function', 'src/models/task.ts');
    expect(id).toBe('sym_my-function_src_models_task_ts');
  });
});
