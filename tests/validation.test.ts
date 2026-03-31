import { describe, expect, it } from 'vitest';

import {
  TaskQuerySchema,
  TaskContextSchema,
  VerificationCommentSchema,
  VerificationSchema,
  PlanStepSchema,
  PlanIterationSchema,
  PlanSchema,
} from '../src/data/validation/schemas.js';

describe('TaskQuerySchema', () => {
  it('accepts a valid query', () => {
    const result = TaskQuerySchema.safeParse({
      query: 'Build a REST API',
      mode: 'plan',
      files: ['src/index.ts'],
      folders: ['src/'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe('Build a REST API');
      expect(result.data.mode).toBe('plan');
      expect(result.data.files).toEqual(['src/index.ts']);
    }
  });

  it('applies defaults for optional fields', () => {
    const result = TaskQuerySchema.safeParse({ query: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('plan');
      expect(result.data.files).toEqual([]);
      expect(result.data.folders).toEqual([]);
    }
  });

  it('rejects empty query', () => {
    const result = TaskQuerySchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Query is required');
    }
  });

  it('rejects missing query', () => {
    const result = TaskQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid mode', () => {
    const result = TaskQuerySchema.safeParse({ query: 'test', mode: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid modes', () => {
    for (const mode of ['plan', 'phases', 'review', 'epic'] as const) {
      const result = TaskQuerySchema.safeParse({ query: 'test', mode });
      expect(result.success).toBe(true);
    }
  });

  it('accepts optional context string', () => {
    const result = TaskQuerySchema.safeParse({ query: 'test', context: 'Some context' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toBe('Some context');
    }
  });
});

describe('TaskContextSchema', () => {
  it('accepts a full context', () => {
    const result = TaskContextSchema.safeParse({
      files: ['src/index.ts'],
      folders: ['src/'],
      gitRef: 'main',
      images: ['screenshot.png'],
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults', () => {
    const result = TaskContextSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.files).toEqual([]);
      expect(result.data.folders).toEqual([]);
    }
  });
});

describe('VerificationSchemas', () => {
  it('validates a complete verification', () => {
    const result = VerificationSchema.safeParse({
      id: 'verif_1',
      taskId: 'task_1',
      timestamp: '2026-01-01T00:00:00.000Z',
      comments: [
        {
          id: 'vcomment_1',
          category: 'critical',
          file: 'src/index.ts',
          line: 42,
          message: 'Bug here',
          suggestion: 'Fix it',
          status: 'open',
        },
      ],
      summary: 'Found 1 issue',
    });
    expect(result.success).toBe(true);
  });

  it('validates verification comment categories', () => {
    const categories = ['critical', 'major', 'minor', 'outdated'] as const;
    for (const category of categories) {
      const result = VerificationCommentSchema.safeParse({
        id: 'vc_1',
        category,
        message: 'test',
        status: 'open',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid comment category', () => {
    const result = VerificationCommentSchema.safeParse({
      id: 'vc_1',
      category: 'urgent',
      message: 'test',
      status: 'open',
    });
    expect(result.success).toBe(false);
  });

  it('validates verification comment statuses', () => {
    const statuses = ['open', 'fixed', 'ignored'] as const;
    for (const status of statuses) {
      const result = VerificationCommentSchema.safeParse({
        id: 'vc_1',
        category: 'minor',
        message: 'test',
        status,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('PlanSchemas', () => {
  it('validates a complete plan', () => {
    const result = PlanSchema.safeParse({
      id: 'plan_1',
      steps: [
        {
          id: 'step_1',
          title: 'Step 1',
          description: 'Do something',
          files: ['src/index.ts'],
        },
      ],
      mermaidDiagram: 'graph LR; A-->B;',
      rationale: 'Because we need it',
      iterations: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates plan without optional fields', () => {
    const result = PlanSchema.safeParse({
      id: 'plan_1',
      steps: [],
      rationale: 'Reason',
      iterations: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates plan step with optional fields', () => {
    const result = PlanStepSchema.safeParse({
      id: 'step_1',
      title: 'Step',
      description: 'Desc',
      files: ['a.ts'],
      symbols: ['MyClass'],
      codeSnippet: 'const x = 1;',
    });
    expect(result.success).toBe(true);
  });

  it('validates plan iteration', () => {
    const result = PlanIterationSchema.safeParse({
      id: 'iter_1',
      note: 'User requested changes',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
