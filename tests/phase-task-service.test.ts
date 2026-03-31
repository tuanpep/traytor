import { describe, expect, it, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { TaskService } from '../src/services/task.service.js';
import { TaskRepository } from '../src/data/repositories/task.repository.js';
import type { Phase } from '../src/models/phase.js';
import { createPhaseId } from '../src/models/phase.js';
import type { Plan } from '../src/models/plan.js';
import { createPlanId, createPlanStepId } from '../src/models/plan.js';
import { PhaseNotFoundError, PhaseGenerationError } from '../src/utils/errors.js';

describe('TaskService - Phases methods', () => {
  let tempDir: string;
  let taskService: TaskService;
  let taskId: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-'));
    const repo = new TaskRepository(tempDir);
    taskService = new TaskService(repo);

    const task = await taskService.createPhasesTask('Build e-commerce platform', '/tmp');
    taskId = task.id;
  });

  function makePhase(overrides: Partial<Phase> = {}): Phase {
    const now = new Date().toISOString();
    return {
      id: createPhaseId(),
      name: 'Test Phase',
      description: 'A test phase',
      status: 'pending',
      order: 1,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function makePlan(): Plan {
    return {
      id: createPlanId(),
      steps: [
        { id: createPlanStepId(0), title: 'Step 1', description: 'Do something', files: ['src/a.ts'] },
      ],
      rationale: 'Test rationale',
      iterations: [],
    };
  }

  describe('createPhasesTask', () => {
    it('creates a task with type "phases" and empty phases array', async () => {
      const task = await taskService.getTask(taskId);
      expect(task.type).toBe('phases');
      expect(task.phases).toEqual([]);
      expect(task.query).toBe('Build e-commerce platform');
    });
  });

  describe('savePhases', () => {
    it('saves phases to a task', async () => {
      const phases = [
        makePhase({ order: 1, name: 'Backend' }),
        makePhase({ order: 2, name: 'Frontend' }),
        makePhase({ order: 3, name: 'Testing' }),
      ];

      await taskService.savePhases(taskId, phases);

      const task = await taskService.getTask(taskId);
      expect(task.phases).toHaveLength(3);
      expect(task.phases![0].name).toBe('Backend');
      expect(task.phases![1].name).toBe('Frontend');
      expect(task.phases![2].name).toBe('Testing');
    });
  });

  describe('getPhase', () => {
    it('returns a phase by order number', async () => {
      const phases = [
        makePhase({ order: 1, name: 'Backend' }),
        makePhase({ order: 2, name: 'Frontend' }),
      ];
      await taskService.savePhases(taskId, phases);

      const task = await taskService.getTask(taskId);
      const phase = taskService.getPhase(task, 1);
      expect(phase.name).toBe('Backend');
    });

    it('throws PhaseNotFoundError for non-existent phase order', async () => {
      const phases = [makePhase({ order: 1, name: 'Backend' })];
      await taskService.savePhases(taskId, phases);

      const task = await taskService.getTask(taskId);
      expect(() => taskService.getPhase(task, 99)).toThrow(PhaseNotFoundError);
    });

    it('throws PhaseNotFoundError when task has no phases', async () => {
      const task = await taskService.getTask(taskId);
      expect(() => taskService.getPhase(task, 1)).toThrow(PhaseNotFoundError);
    });
  });

  describe('updatePhaseStatus', () => {
    it('updates phase status and persists', async () => {
      const phases = [
        makePhase({ order: 1, name: 'Backend' }),
        makePhase({ order: 2, name: 'Frontend' }),
      ];
      await taskService.savePhases(taskId, phases);

      await taskService.updatePhaseStatus(taskId, 1, 'in_progress');
      const task = await taskService.getTask(taskId);
      expect(task.phases![0].status).toBe('in_progress');

      await taskService.updatePhaseStatus(taskId, 1, 'completed');
      const updated = await taskService.getTask(taskId);
      expect(updated.phases![0].status).toBe('completed');
    });

    it('builds context carry-over from completed preceding phases', async () => {
      const phases = [
        makePhase({
          order: 1,
          name: 'Backend',
          status: 'completed',
          plan: makePlan(),
        }),
        makePhase({ order: 2, name: 'Frontend' }),
      ];
      await taskService.savePhases(taskId, phases);

      await taskService.updatePhaseStatus(taskId, 2, 'in_progress');
      const task = await taskService.getTask(taskId);
      const phase2 = task.phases![1];
      expect(phase2.contextCarryOver).toBeDefined();
      expect(phase2.contextCarryOver!.filesChanged).toContain('src/a.ts');
    });

    it('records status change in task history', async () => {
      const phases = [makePhase({ order: 1, name: 'Backend' })];
      await taskService.savePhases(taskId, phases);

      await taskService.updatePhaseStatus(taskId, 1, 'in_progress');
      const task = await taskService.getTask(taskId);
      const historyEntry = task.history.find((h) => h.action === 'phase_status_changed');
      expect(historyEntry).toBeDefined();
      expect(historyEntry!.details).toContain('pending');
      expect(historyEntry!.details).toContain('in_progress');
    });
  });

  describe('savePhasePlan', () => {
    it('saves a plan to a specific phase', async () => {
      const phases = [makePhase({ order: 1, name: 'Backend' })];
      await taskService.savePhases(taskId, phases);

      const plan = makePlan();
      await taskService.savePhasePlan(taskId, 1, plan);

      const task = await taskService.getTask(taskId);
      expect(task.phases![0].plan).toBeDefined();
      expect(task.phases![0].plan!.steps).toHaveLength(1);
    });
  });

  describe('insertPhase', () => {
    it('inserts a phase at a specific position and shifts others', async () => {
      const phases = [
        makePhase({ order: 1, name: 'Backend' }),
        makePhase({ order: 2, name: 'Frontend' }),
      ];
      await taskService.savePhases(taskId, phases);

      const newPhase = makePhase({ name: 'Database' });
      const result = await taskService.insertPhase(taskId, newPhase, 1);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Backend');
      expect(result[0].order).toBe(1);
      expect(result[1].name).toBe('Database');
      expect(result[1].order).toBe(2);
      expect(result[2].name).toBe('Frontend');
      expect(result[2].order).toBe(3);
    });
  });

  describe('addPhase', () => {
    it('adds a phase at the end', async () => {
      const phases = [
        makePhase({ order: 1, name: 'Backend' }),
        makePhase({ order: 2, name: 'Frontend' }),
      ];
      await taskService.savePhases(taskId, phases);

      const newPhase = makePhase({ name: 'Testing' });
      const result = await taskService.addPhase(taskId, newPhase);

      expect(result).toHaveLength(3);
      expect(result[2].name).toBe('Testing');
      expect(result[2].order).toBe(3);
    });
  });

  describe('reorderPhases', () => {
    it('reorders phases by ID list', async () => {
      const phases = [
        makePhase({ order: 1, name: 'Backend' }),
        makePhase({ order: 2, name: 'Frontend' }),
        makePhase({ order: 3, name: 'Testing' }),
      ];
      await taskService.savePhases(taskId, phases);

      const task = await taskService.getTask(taskId);
      // Reverse the order
      const reversedIds = [
        task.phases![2].id,
        task.phases![1].id,
        task.phases![0].id,
      ];
      const result = await taskService.reorderPhases(taskId, reversedIds);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Testing');
      expect(result[0].order).toBe(1);
      expect(result[1].name).toBe('Frontend');
      expect(result[1].order).toBe(2);
      expect(result[2].name).toBe('Backend');
      expect(result[2].order).toBe(3);
    });

    it('throws PhaseNotFoundError for non-existent phase ID', async () => {
      const phases = [makePhase({ order: 1, name: 'Backend' })];
      await taskService.savePhases(taskId, phases);

      await expect(taskService.reorderPhases(taskId, ['non-existent-id']))
        .rejects.toThrow(PhaseNotFoundError);
    });

    it('throws PhaseGenerationError when ID count mismatches', async () => {
      const phases = [
        makePhase({ order: 1, name: 'Backend' }),
        makePhase({ order: 2, name: 'Frontend' }),
      ];
      await taskService.savePhases(taskId, phases);

      const task = await taskService.getTask(taskId);
      // Only provide 1 ID when there are 2 phases
      await expect(taskService.reorderPhases(taskId, [task.phases![0].id]))
        .rejects.toThrow(PhaseGenerationError);
    });
  });

  describe('getContextCarryOver', () => {
    it('returns carry-over from all completed phases before the given order', async () => {
      const phases = [
        makePhase({ order: 1, name: 'Backend', status: 'completed', plan: makePlan() }),
        makePhase({ order: 2, name: 'Frontend', status: 'completed', plan: makePlan() }),
        makePhase({ order: 3, name: 'Testing', status: 'pending' }),
      ];
      await taskService.savePhases(taskId, phases);

      const task = await taskService.getTask(taskId);
      const carryOver = taskService.getContextCarryOver(task, 3);

      expect(carryOver).toBeDefined();
      // Should have context from phases 1 and 2
      expect(carryOver!.rationale).toHaveLength(2);
    });

    it('returns undefined when no completed phases before given order', async () => {
      const phases = [makePhase({ order: 1, name: 'Backend', status: 'pending' })];
      await taskService.savePhases(taskId, phases);

      const task = await taskService.getTask(taskId);
      const carryOver = taskService.getContextCarryOver(task, 1);
      expect(carryOver).toBeUndefined();
    });
  });
});
