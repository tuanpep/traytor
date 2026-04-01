import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { WorkflowEngine } from '../src/services/workflow-engine.js';
import { WorkflowNotFoundError, WorkflowStateError, WorkflowError } from '../src/utils/errors.js';

describe('WorkflowEngine', () => {
  let tmpDir: string;
  let engine: WorkflowEngine;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traytor-wf-test-'));
    engine = new WorkflowEngine({ dataDir: tmpDir });
    await engine.initialize();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('listWorkflows()', () => {
    it('includes the default workflow', () => {
      const workflows = engine.listWorkflows();

      expect(workflows.length).toBeGreaterThanOrEqual(1);
      const defaultWf = workflows.find((w) => w.name === 'default');
      expect(defaultWf).toBeDefined();
      expect(defaultWf!.steps.length).toBe(4);
    });
  });

  describe('getWorkflow()', () => {
    it('returns the default workflow', () => {
      const workflow = engine.getWorkflow('default');

      expect(workflow.name).toBe('default');
      expect(workflow.steps.length).toBe(4);
      expect(workflow.steps[0].name).toBe('Plan');
      expect(workflow.steps[1].name).toBe('Execute');
      expect(workflow.steps[2].name).toBe('Verify');
      expect(workflow.steps[3].name).toBe('Complete');
    });

    it('throws WorkflowNotFoundError for unknown workflow', () => {
      expect(() => engine.getWorkflow('nonexistent')).toThrow(WorkflowNotFoundError);
    });
  });

  describe('createWorkflow()', () => {
    it('creates and saves a new workflow', async () => {
      const definition = {
        name: 'test-workflow',
        description: 'A test workflow',
        steps: [
          {
            id: 'wf_step_def_1',
            name: 'Step 1',
            description: 'First step',
            order: 1,
            command: 'plan' as const,
            required: true,
          },
          {
            id: 'wf_step_def_2',
            name: 'Step 2',
            description: 'Second step',
            order: 2,
            command: 'exec' as const,
            required: false,
          },
        ],
      };

      await engine.createWorkflow(definition);

      const workflows = engine.listWorkflows();
      expect(workflows.find((w) => w.name === 'test-workflow')).toBeDefined();

      // Verify it was saved to disk
      const filePath = path.join(tmpDir, 'workflows', 'test-workflow.yaml');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('throws WorkflowError when creating a duplicate', async () => {
      const definition = {
        name: 'default',
        description: 'Duplicate',
        steps: [
          {
            id: 'wf_step_def_1',
            name: 'Step',
            description: '',
            order: 1,
            command: 'plan' as const,
            required: true,
          },
        ],
      };

      await expect(engine.createWorkflow(definition)).rejects.toThrow(WorkflowError);
    });

    it('throws WorkflowError for empty steps', async () => {
      const definition = {
        name: 'empty',
        description: 'No steps',
        steps: [],
      };

      await expect(engine.createWorkflow(definition)).rejects.toThrow(WorkflowError);
    });

    it('throws WorkflowError for missing name', async () => {
      const definition = {
        name: '',
        description: 'No name',
        steps: [
          {
            id: 'wf_step_def_1',
            name: 'Step',
            description: '',
            order: 1,
            command: 'plan' as const,
            required: true,
          },
        ],
      };

      await expect(engine.createWorkflow(definition)).rejects.toThrow(WorkflowError);
    });
  });

  describe('startWorkflow()', () => {
    it('starts a default workflow', async () => {
      const state = await engine.startWorkflow('task-123');

      expect(state.taskId).toBe('task-123');
      expect(state.status).toBe('in_progress');
      expect(state.currentStepIndex).toBe(0);
      expect(state.stepStates.length).toBe(4);
      expect(state.stepStates[0].status).toBe('active');
      expect(state.stepStates[1].status).toBe('pending');
      expect(state.stepStates[2].status).toBe('pending');
      expect(state.stepStates[3].status).toBe('pending');
      expect(state.definition.name).toBe('default');
    });

    it('persists state to disk', async () => {
      const state = await engine.startWorkflow('task-456');

      const filePath = path.join(tmpDir, 'workflows', 'states', `${state.workflowId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      const loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(loaded.taskId).toBe('task-456');
    });
  });

  describe('advanceWorkflow()', () => {
    it('advances to the next step', async () => {
      const state = await engine.startWorkflow('task-1');
      const advanced = await engine.advanceWorkflow(state.workflowId, 'done');

      expect(advanced.currentStepIndex).toBe(1);
      expect(advanced.stepStates[0].status).toBe('completed');
      expect(advanced.stepStates[0].result).toBe('done');
      expect(advanced.stepStates[1].status).toBe('active');
      expect(advanced.status).toBe('in_progress');
    });

    it('completes the workflow when all steps are done', async () => {
      const state = await engine.startWorkflow('task-2');

      // Advance through all 4 steps
      let current = state;
      for (let i = 0; i < 4; i++) {
        current = await engine.advanceWorkflow(current.workflowId);
      }

      expect(current.status).toBe('completed');
      expect(current.completedAt).toBeTruthy();
    });

    it('throws WorkflowStateError for completed workflow', async () => {
      const state = await engine.startWorkflow('task-3');

      // Advance through all steps
      let current = state;
      for (let i = 0; i < 4; i++) {
        current = await engine.advanceWorkflow(current.workflowId);
      }

      await expect(engine.advanceWorkflow(current.workflowId)).rejects.toThrow(WorkflowStateError);
    });

    it('throws WorkflowStateError for paused workflow', async () => {
      const state = await engine.startWorkflow('task-4');
      await engine.pauseWorkflow(state.workflowId);

      await expect(engine.advanceWorkflow(state.workflowId)).rejects.toThrow(WorkflowStateError);
    });
  });

  describe('skipStep()', () => {
    it('skips an optional step', async () => {
      // Create a workflow with an optional step
      await engine.createWorkflow({
        name: 'with-optional',
        steps: [
          {
            id: 'wf_step_def_1',
            name: 'Required',
            description: '',
            order: 1,
            command: 'plan',
            required: true,
          },
          {
            id: 'wf_step_def_2',
            name: 'Optional',
            description: '',
            order: 2,
            command: 'exec',
            required: false,
          },
          {
            id: 'wf_step_def_3',
            name: 'Final',
            description: '',
            order: 3,
            command: 'complete',
            required: true,
          },
        ],
      });

      const state = await engine.startWorkflow('task-5', 'with-optional');
      expect(state.currentStepIndex).toBe(0);

      const afterAdvance = await engine.advanceWorkflow(state.workflowId);
      expect(afterAdvance.currentStepIndex).toBe(1);

      const afterSkip = await engine.skipStep(afterAdvance.workflowId);
      expect(afterSkip.currentStepIndex).toBe(2);
      expect(afterSkip.stepStates[1].status).toBe('skipped');
    });

    it('throws WorkflowStateError when trying to skip a required step', async () => {
      const state = await engine.startWorkflow('task-6');

      await expect(engine.skipStep(state.workflowId)).rejects.toThrow(WorkflowStateError);
    });
  });

  describe('pauseWorkflow() / resumeWorkflow()', () => {
    it('pauses and resumes a workflow', async () => {
      const state = await engine.startWorkflow('task-7');

      const paused = await engine.pauseWorkflow(state.workflowId);
      expect(paused.status).toBe('paused');

      const resumed = await engine.resumeWorkflow(paused.workflowId);
      expect(resumed.status).toBe('in_progress');
    });

    it('throws when pausing a completed workflow', async () => {
      const state = await engine.startWorkflow('task-8');

      let current = state;
      for (let i = 0; i < 4; i++) {
        current = await engine.advanceWorkflow(current.workflowId);
      }

      await expect(engine.pauseWorkflow(current.workflowId)).rejects.toThrow(WorkflowStateError);
    });

    it('throws when resuming a non-paused workflow', async () => {
      const state = await engine.startWorkflow('task-9');

      await expect(engine.resumeWorkflow(state.workflowId)).rejects.toThrow(WorkflowStateError);
    });
  });

  describe('getWorkflowState()', () => {
    it('returns state for a running workflow', async () => {
      const state = await engine.startWorkflow('task-10');

      const retrieved = engine.getWorkflowState(state.workflowId);
      expect(retrieved.taskId).toBe('task-10');
    });

    it('throws WorkflowStateError for unknown workflow ID', () => {
      expect(() => engine.getWorkflowState('nonexistent')).toThrow(WorkflowStateError);
    });

    it('loads state from disk', async () => {
      const state = await engine.startWorkflow('task-11');

      // Create a new engine instance (simulating restart)
      const newEngine = new WorkflowEngine({ dataDir: tmpDir });
      await newEngine.initialize();

      const retrieved = newEngine.getWorkflowState(state.workflowId);
      expect(retrieved.taskId).toBe('task-11');
    });
  });

  describe('getCurrentStep()', () => {
    it('returns the current step definition', async () => {
      const state = await engine.startWorkflow('task-12');

      const step = engine.getCurrentStep(state.workflowId);
      expect(step.name).toBe('Plan');
    });

    it('returns the next step after advancing', async () => {
      const state = await engine.startWorkflow('task-13');
      await engine.advanceWorkflow(state.workflowId);

      const step = engine.getCurrentStep(state.workflowId);
      expect(step.name).toBe('Execute');
    });
  });

  describe('getNextCommand()', () => {
    it('returns the command for the current step', async () => {
      const state = await engine.startWorkflow('task-14');

      const cmd = engine.getNextCommand(state.workflowId);
      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe('plan');
      expect(cmd!.stepName).toBe('Plan');
    });

    it('returns null for completed workflow', async () => {
      const state = await engine.startWorkflow('task-15');

      let current = state;
      for (let i = 0; i < 4; i++) {
        current = await engine.advanceWorkflow(current.workflowId);
      }

      const cmd = engine.getNextCommand(current.workflowId);
      expect(cmd).toBeNull();
    });
  });

  describe('custom workflow loading', () => {
    it('loads custom workflows from disk on initialize', async () => {
      // Create a workflow file manually
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });

      const yaml = [
        'name: custom-loaded',
        'description: Loaded from disk',
        'steps:',
        '  - name: Build',
        '    description: Build the project',
        '    command: exec',
        '    required: true',
        '  - name: Test',
        '    description: Run tests',
        '    command: exec',
        '    required: false',
      ].join('\n');

      fs.writeFileSync(path.join(workflowsDir, 'custom-loaded.yaml'), yaml, 'utf-8');

      // Create new engine to test loading
      const newEngine = new WorkflowEngine({ dataDir: tmpDir });
      await newEngine.initialize();

      const workflows = newEngine.listWorkflows();
      const custom = workflows.find((w) => w.name === 'custom-loaded');
      expect(custom).toBeDefined();
      expect(custom!.steps.length).toBe(2);
    });
  });
});
