import { describe, expect, it } from 'vitest';
import { PhaseGenerator, buildContextCarryOver } from '../src/services/phase-generator.js';
import type { Phase, PhaseContextCarryOver } from '../src/models/phase.js';
import { createPhaseId } from '../src/models/phase.js';

describe('PhaseGenerator', () => {
  describe('parsePhaseResponse', () => {
    function createGenerator(): PhaseGenerator {
      // Mock dependencies — only needed for parsing, not LLM calls
      const mockLLM = {} as any;
      const mockTemplate = {} as any;
      return new PhaseGenerator(mockLLM, mockTemplate, '/tmp');
    }

    it('parses well-formed phase response with multiple phases', () => {
      const generator = createGenerator();
      const markdown = `
## Rationale
Break into backend, frontend, and integration phases.

## Phase 1: Backend Setup
Set up the data models, API routes, and database connections.

## Phase 2: Frontend Development
Build the UI components and connect to the API.

## Phase 3: Integration Testing
Write end-to-end tests and fix any issues.
`;

      const phases = generator.parsePhaseResponse(markdown);

      expect(phases).toHaveLength(3);
      expect(phases[0].name).toBe('Backend Setup');
      expect(phases[0].order).toBe(1);
      expect(phases[0].status).toBe('pending');
      expect(phases[0].description).toContain('data models');

      expect(phases[1].name).toBe('Frontend Development');
      expect(phases[1].order).toBe(2);

      expect(phases[2].name).toBe('Integration Testing');
      expect(phases[2].order).toBe(3);
    });

    it('re-indexes phases to be sequential when numbers are non-contiguous', () => {
      const generator = createGenerator();
      const markdown = `
## Phase 1: First
Description for first phase.

## Phase 5: Second
Description for second phase.

## Phase 3: Third
Description for third phase.
`;

      const phases = generator.parsePhaseResponse(markdown);

      expect(phases).toHaveLength(3);
      expect(phases[0].order).toBe(1);
      expect(phases[1].order).toBe(2);
      expect(phases[2].order).toBe(3);
    });

    it('falls back to single phase when no structured phases found', () => {
      const generator = createGenerator();
      const markdown = 'This is just a plain text response without phase headers.';

      const phases = generator.parsePhaseResponse(markdown);

      expect(phases).toHaveLength(1);
      expect(phases[0].name).toBe('Implementation');
      expect(phases[0].order).toBe(1);
      expect(phases[0].status).toBe('pending');
    });

    it('parses phases with dash separator', () => {
      const generator = createGenerator();
      const markdown = `
## Phase 1 — Data Layer
Build the database schema and migrations.

## Phase 2 — API Layer
Create REST endpoints.
`;

      const phases = generator.parsePhaseResponse(markdown);

      expect(phases).toHaveLength(2);
      expect(phases[0].name).toBe('Data Layer');
      expect(phases[1].name).toBe('API Layer');
    });

    it('each phase has unique ID', () => {
      const generator = createGenerator();
      const markdown = `
## Phase 1: Alpha
First phase.

## Phase 2: Beta
Second phase.
`;

      const phases = generator.parsePhaseResponse(markdown);
      const ids = phases.map((p) => p.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('each phase has createdAt and updatedAt timestamps', () => {
      const generator = createGenerator();
      const markdown = `
## Phase 1: Only Phase
A phase description.
`;

      const phases = generator.parsePhaseResponse(markdown);
      expect(phases[0].createdAt).toBeDefined();
      expect(phases[0].updatedAt).toBeDefined();
      expect(typeof phases[0].createdAt).toBe('string');
      expect(typeof phases[0].updatedAt).toBe('string');
    });
  });
});

describe('buildContextCarryOver', () => {
  it('returns empty context for no completed phases', () => {
    const carryOver = buildContextCarryOver([]);
    expect(carryOver.filesChanged).toEqual([]);
    expect(carryOver.decisions).toEqual([]);
    expect(carryOver.rationale).toEqual([]);
  });

  it('collects files from completed phase plans', () => {
    const phases: Phase[] = [
      {
        id: 'phase_1',
        name: 'Backend',
        description: 'Setup backend',
        status: 'completed',
        order: 1,
        plan: {
          id: 'plan_1',
          steps: [
            { id: 's1', title: 'Create models', description: 'Create data models', files: ['src/models/user.ts', 'src/models/post.ts'] },
            { id: 's2', title: 'Create routes', description: 'Create API routes', files: ['src/routes/api.ts'] },
          ],
          rationale: 'Backend first approach',
          iterations: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const carryOver = buildContextCarryOver(phases);
    expect(carryOver.filesChanged).toContain('src/models/user.ts');
    expect(carryOver.filesChanged).toContain('src/models/post.ts');
    expect(carryOver.filesChanged).toContain('src/routes/api.ts');
    expect(carryOver.rationale).toHaveLength(1);
    expect(carryOver.rationale[0]).toContain('Backend first approach');
  });

  it('deduplicates files across multiple phases', () => {
    const phases: Phase[] = [
      {
        id: 'phase_1',
        name: 'Phase 1',
        description: 'First',
        status: 'completed',
        order: 1,
        plan: {
          id: 'plan_1',
          steps: [
            { id: 's1', title: 'Step 1', description: 'Create shared types', files: ['src/types.ts'] },
          ],
          rationale: 'Types first',
          iterations: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'phase_2',
        name: 'Phase 2',
        description: 'Second',
        status: 'completed',
        order: 2,
        plan: {
          id: 'plan_2',
          steps: [
            { id: 's2', title: 'Step 2', description: 'Update types', files: ['src/types.ts', 'src/utils.ts'] },
          ],
          rationale: 'Utils second',
          iterations: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const carryOver = buildContextCarryOver(phases);
    expect(carryOver.filesChanged).toHaveLength(2);
    expect(carryOver.rationale).toHaveLength(2);
  });

  it('collects verification summaries as decisions', () => {
    const phases: Phase[] = [
      {
        id: 'phase_1',
        name: 'Phase 1',
        description: 'First',
        status: 'completed',
        order: 1,
        plan: {
          id: 'plan_1',
          steps: [{ id: 's1', title: 'Step', description: 'Do things', files: ['src/a.ts'] }],
          rationale: 'Reasoning',
          iterations: [],
        },
        verification: {
          id: 'verif_1',
          taskId: 'task_1',
          timestamp: '2026-01-01T00:00:00Z',
          comments: [],
          summary: 'APPROVED - all checks passed',
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const carryOver = buildContextCarryOver(phases);
    expect(carryOver.decisions).toHaveLength(1);
    expect(carryOver.decisions[0]).toContain('APPROVED');
  });

  it('processes all phases passed to it (filtering is caller responsibility)', () => {
    // buildContextCarryOver does not filter by status — the caller (getContextCarryOver)
    // is responsible for passing only completed phases.
    const phases: Phase[] = [
      {
        id: 'phase_1',
        name: 'Phase 1',
        description: 'First',
        status: 'pending',
        order: 1,
        plan: {
          id: 'plan_1',
          steps: [{ id: 's1', title: 'Step', description: 'Do things', files: ['src/a.ts'] }],
          rationale: 'Reasoning',
          iterations: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'phase_2',
        name: 'Phase 2',
        description: 'Second',
        status: 'in_progress',
        order: 2,
        plan: {
          id: 'plan_2',
          steps: [{ id: 's2', title: 'Step', description: 'Do more', files: ['src/b.ts'] }],
          rationale: 'More reasoning',
          iterations: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const carryOver = buildContextCarryOver(phases);
    // Since buildContextCarryOver doesn't filter, it processes all phases passed in
    expect(carryOver.filesChanged).toEqual(['src/a.ts', 'src/b.ts']);
    expect(carryOver.rationale).toHaveLength(2);
  });
});

describe('Phase model', () => {
  it('createPhaseId produces phase_{timestamp}_{random} format', () => {
    const id = createPhaseId(1700000000000);
    expect(id).toMatch(/^phase_1700000000000_\w{6}$/);
  });

  it('PhaseContextCarryOver structure is correct', () => {
    const carryOver: PhaseContextCarryOver = {
      filesChanged: ['src/a.ts', 'src/b.ts'],
      decisions: ['Use PostgreSQL', 'REST over GraphQL'],
      rationale: ['Backend first for data stability'],
    };

    expect(carryOver.filesChanged).toHaveLength(2);
    expect(carryOver.decisions).toHaveLength(2);
    expect(carryOver.rationale).toHaveLength(1);
  });
});
