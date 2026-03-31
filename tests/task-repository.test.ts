import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '../src/models/task.js';
import { TaskRepository } from '../src/data/repositories/task.repository.js';

function createTestTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: `task_test_${Math.random().toString(36).slice(2, 8)}`,
    type: 'plan',
    query: 'Test task',
    status: 'pending',
    context: { files: [], folders: [] },
    executions: [],
    history: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('TaskRepository', () => {
  const tmpDirs: string[] = [];
  let repo: TaskRepository;

  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traytor-repo-'));
    tmpDirs.push(dir);
    repo = new TaskRepository(dir);
  });

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  describe('save and findById', () => {
    it('saves and retrieves a task by ID', async () => {
      const task = createTestTask();
      await repo.save(task);

      const found = await repo.findById(task.id);
      expect(found).toEqual(task);
    });

    it('returns null for non-existent task', async () => {
      const found = await repo.findById('nonexistent');
      expect(found).toBeNull();
    });

    it('overwrites existing task on re-save', async () => {
      const task = createTestTask();
      await repo.save(task);

      const updated = { ...task, query: 'Updated query', status: 'completed' as const };
      await repo.save(updated);

      const found = await repo.findById(task.id);
      expect(found!.query).toBe('Updated query');
      expect(found!.status).toBe('completed');
    });
  });

  describe('findAll', () => {
    it('returns empty array when no tasks exist', async () => {
      const tasks = await repo.findAll();
      expect(tasks).toEqual([]);
    });

    it('returns all tasks sorted by createdAt descending', async () => {
      const older = createTestTask({
        id: 'task_older',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      const newer = createTestTask({
        id: 'task_newer',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      });
      const newest = createTestTask({
        id: 'task_newest',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      });

      await repo.save(older);
      await repo.save(newest);
      await repo.save(newer);

      const all = await repo.findAll();
      expect(all.map((t) => t.id)).toEqual(['task_newest', 'task_newer', 'task_older']);
    });
  });

  describe('delete', () => {
    it('deletes a task and returns true', async () => {
      const task = createTestTask();
      await repo.save(task);

      const result = await repo.delete(task.id);
      expect(result).toBe(true);

      const found = await repo.findById(task.id);
      expect(found).toBeNull();
    });

    it('returns false for non-existent task', async () => {
      const result = await repo.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('removes task from findAll', async () => {
      const task1 = createTestTask({ id: 'task_keep' });
      const task2 = createTestTask({ id: 'task_remove' });
      await repo.save(task1);
      await repo.save(task2);

      await repo.delete(task2.id);

      const all = await repo.findAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('task_keep');
    });
  });

  describe('addExecution', () => {
    it('appends an execution to the task', async () => {
      const task = createTestTask();
      await repo.save(task);

      const updated = await repo.addExecution(task.id, {
        status: 'success',
        agentId: 'claude-code',
        stdout: 'Done',
      });

      expect(updated.executions).toHaveLength(1);
      expect(updated.executions[0].agentId).toBe('claude-code');
      expect(updated.executions[0].status).toBe('success');
      expect(updated.executions[0].stdout).toBe('Done');
      expect(updated.executions[0].id).toMatch(/^exec_\d+_\w+$/);
      expect(updated.executions[0].timestamp).toBeDefined();
    });

    it('throws for non-existent task', async () => {
      await expect(
        repo.addExecution('nonexistent', { status: 'success', agentId: 'test' })
      ).rejects.toThrow('Task "nonexistent" not found');
    });

    it('appends multiple executions in order', async () => {
      const task = createTestTask();
      await repo.save(task);

      await repo.addExecution(task.id, { status: 'failed', agentId: 'agent1', stderr: 'error' });
      await repo.addExecution(task.id, { status: 'success', agentId: 'agent2', stdout: 'ok' });

      const loaded = await repo.findById(task.id);
      expect(loaded!.executions).toHaveLength(2);
      expect(loaded!.executions[0].agentId).toBe('agent1');
      expect(loaded!.executions[1].agentId).toBe('agent2');
    });

    it('updates the task updatedAt timestamp', async () => {
      const task = createTestTask({ updatedAt: '2026-01-01T00:00:00.000Z' });
      await repo.save(task);

      const updated = await repo.addExecution(task.id, { status: 'success', agentId: 'test' });
      expect(updated.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');

      const loaded = await repo.findById(task.id);
      expect(loaded!.updatedAt).toBe(updated.updatedAt);
    });
  });

  describe('different task types', () => {
    it('stores phases type tasks', async () => {
      const task = createTestTask({
        type: 'phases',
        phases: [
          {
            id: 'phase_1',
            name: 'Phase 1',
            description: 'First phase',
            status: 'completed',
          },
        ],
      });
      await repo.save(task);

      const found = await repo.findById(task.id);
      expect(found!.type).toBe('phases');
      expect(found!.phases).toHaveLength(1);
    });

    it('stores review type tasks', async () => {
      const taskId = 'task_review_test';
      const task = createTestTask({
        id: taskId,
        type: 'review',
        review: {
          id: 'review_1',
          files: ['src/index.ts'],
          verification: {
            id: 'verif_1',
            taskId,
            timestamp: new Date().toISOString(),
            comments: [],
            summary: 'LGTM',
          },
        },
      });
      await repo.save(task);

      const found = await repo.findById(task.id);
      expect(found!.type).toBe('review');
      expect(found!.review!.verification.summary).toBe('LGTM');
    });

    it('stores tasks with history entries', async () => {
      const task = createTestTask({
        history: [
          { timestamp: '2026-01-01T00:00:00.000Z', action: 'created' },
          { timestamp: '2026-01-02T00:00:00.000Z', action: 'plan_generated' },
        ],
      });
      await repo.save(task);

      const found = await repo.findById(task.id);
      expect(found!.history).toHaveLength(2);
    });
  });
});
