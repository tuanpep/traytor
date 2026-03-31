import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getLogger } from '../utils/logger.js';
import { WorkflowError, WorkflowNotFoundError, WorkflowStateError } from '../utils/errors.js';
import type { GitService } from './git-service.js';
import {
  DEFAULT_WORKFLOW,
  createWorkflowId,
  createWorkflowStepDefId,
  type WorkflowDefinition,
  type WorkflowStepDefinition,
  type WorkflowState,
  type WorkflowDefinitionFile,
} from '../models/workflow.js';

const WORKFLOWS_DIR_NAME = 'workflows';

export interface WorkflowEngineOptions {
  dataDir?: string;
  gitService?: GitService;
}

export interface AutoCommitConfig {
  enabled: boolean;
  messageTemplate: string;
}

export class WorkflowEngine {
  private logger = getLogger();
  private workflowsDir: string;
  private gitService?: GitService;
  private definitions: Map<string, WorkflowDefinition> = new Map();
  private states: Map<string, WorkflowState> = new Map();

  constructor(options: WorkflowEngineOptions = {}) {
    this.workflowsDir = path.join(options.dataDir ?? path.join(os.homedir(), '.sdd-tool', 'data'), WORKFLOWS_DIR_NAME);
    this.gitService = options.gitService;
    this.definitions.set(DEFAULT_WORKFLOW.name, DEFAULT_WORKFLOW);
  }

  /**
   * Initialize the workflow engine, loading custom workflows from disk.
   */
  async initialize(): Promise<void> {
    try {
      if (fs.existsSync(this.workflowsDir)) {
        const files = fs.readdirSync(this.workflowsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
        for (const file of files) {
          try {
            const content = fs.readFileSync(path.join(this.workflowsDir, file), 'utf-8');
            const parsed = parseYaml(content) as WorkflowDefinitionFile;
            const definition = this.parseWorkflowDefinitionFile(parsed);
            this.definitions.set(definition.name, definition);
            this.logger.debug(`Loaded custom workflow: ${definition.name}`);
          } catch (error) {
            this.logger.warn(`Failed to load workflow from ${file}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to initialize workflow engine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all available workflow definitions.
   */
  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Get a workflow definition by name.
   */
  getWorkflow(name: string): WorkflowDefinition {
    const workflow = this.definitions.get(name);
    if (!workflow) {
      throw new WorkflowNotFoundError(name);
    }
    return workflow;
  }

  /**
   * Create and save a new custom workflow definition.
   */
  async createWorkflow(definition: WorkflowDefinition): Promise<void> {
    if (this.definitions.has(definition.name)) {
      throw new WorkflowError(`Workflow "${definition.name}" already exists`);
    }

    // Validate the workflow definition
    this.validateDefinition(definition);

    // Save to disk
    fs.mkdirSync(this.workflowsDir, { recursive: true });
    const filePath = path.join(this.workflowsDir, `${definition.name}.yaml`);
    const fileContent = stringifyYaml(this.toDefinitionFile(definition));
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    // Register in memory
    this.definitions.set(definition.name, definition);
    this.logger.info(`Created workflow: ${definition.name}`);
  }

  /**
   * Start a new workflow execution for a task.
   */
  async startWorkflow(taskId: string, workflowName = 'default'): Promise<WorkflowState> {
    const definition = this.getWorkflow(workflowName);

    const now = new Date().toISOString();
    const state: WorkflowState = {
      workflowId: createWorkflowId(),
      definition,
      taskId,
      currentStepIndex: 0,
      stepStates: definition.steps.map((step) => ({
        stepId: step.id,
        status: step.order === 1 ? 'active' : 'pending',
      })),
      status: 'in_progress',
      startedAt: now,
      updatedAt: now,
    };

    this.states.set(state.workflowId, state);
    await this.saveState(state);

    this.logger.info(`Started workflow ${workflowName} for task ${taskId}: ${state.workflowId}`);
    return state;
  }

  /**
   * Advance the workflow to the next step, marking the current step as completed.
   */
  async advanceWorkflow(workflowId: string, result?: string): Promise<WorkflowState> {
    const state = this.getWorkflowState(workflowId);

    if (state.status !== 'in_progress') {
      throw new WorkflowStateError(`Workflow ${workflowId} is not in progress (status: ${state.status})`);
    }

    const currentStepState = state.stepStates[state.currentStepIndex];

    // Mark current step as completed
    currentStepState.status = 'completed';
    currentStepState.completedAt = new Date().toISOString();
    if (result) {
      currentStepState.result = result;
    }

    // Check if there's a next step
    const nextIndex = state.currentStepIndex + 1;
    if (nextIndex < state.definition.steps.length) {
      // Activate the next step
      state.currentStepIndex = nextIndex;
      const nextStepState = state.stepStates[nextIndex];
      nextStepState.status = 'active';
      nextStepState.startedAt = new Date().toISOString();
      state.updatedAt = new Date().toISOString();

      this.logger.info(`Workflow ${workflowId} advanced to step ${nextIndex + 1}: ${state.definition.steps[nextIndex].name}`);
    } else {
      // All steps completed
      state.status = 'completed';
      state.completedAt = new Date().toISOString();
      state.updatedAt = new Date().toISOString();

      this.logger.info(`Workflow ${workflowId} completed`);
    }

    await this.saveState(state);
    return state;
  }

  /**
   * Skip the current workflow step.
   */
  async skipStep(workflowId: string): Promise<WorkflowState> {
    const state = this.getWorkflowState(workflowId);

    if (state.status !== 'in_progress') {
      throw new WorkflowStateError(`Workflow ${workflowId} is not in progress (status: ${state.status})`);
    }

    const step = state.definition.steps[state.currentStepIndex];
    if (step.required) {
      throw new WorkflowStateError(`Cannot skip required step: ${step.name}`);
    }

    const currentStepState = state.stepStates[state.currentStepIndex];
    currentStepState.status = 'skipped';
    currentStepState.completedAt = new Date().toISOString();

    // Move to next step or complete
    const nextIndex = state.currentStepIndex + 1;
    if (nextIndex < state.definition.steps.length) {
      state.currentStepIndex = nextIndex;
      const nextStepState = state.stepStates[nextIndex];
      nextStepState.status = 'active';
      nextStepState.startedAt = new Date().toISOString();
    } else {
      state.status = 'completed';
      state.completedAt = new Date().toISOString();
    }

    state.updatedAt = new Date().toISOString();
    await this.saveState(state);

    this.logger.info(`Workflow ${workflowId} skipped step ${step.name}`);
    return state;
  }

  /**
   * Pause a workflow.
   */
  async pauseWorkflow(workflowId: string): Promise<WorkflowState> {
    const state = this.getWorkflowState(workflowId);

    if (state.status !== 'in_progress') {
      throw new WorkflowStateError(`Workflow ${workflowId} is not in progress (status: ${state.status})`);
    }

    state.status = 'paused';
    state.updatedAt = new Date().toISOString();
    await this.saveState(state);

    this.logger.info(`Workflow ${workflowId} paused`);
    return state;
  }

  /**
   * Resume a paused workflow.
   */
  async resumeWorkflow(workflowId: string): Promise<WorkflowState> {
    const state = this.getWorkflowState(workflowId);

    if (state.status !== 'paused') {
      throw new WorkflowStateError(`Workflow ${workflowId} is not paused (status: ${state.status})`);
    }

    state.status = 'in_progress';
    state.updatedAt = new Date().toISOString();
    await this.saveState(state);

    this.logger.info(`Workflow ${workflowId} resumed`);
    return state;
  }

  /**
   * Get the current workflow state.
   */
  getWorkflowState(workflowId: string): WorkflowState {
    const state = this.states.get(workflowId);
    if (!state) {
      // Try loading from disk
      const loaded = this.loadState(workflowId);
      if (loaded) {
        this.states.set(workflowId, loaded);
        return loaded;
      }
      throw new WorkflowStateError(`Workflow state "${workflowId}" not found`);
    }
    return state;
  }

  /**
   * Get the current step of a workflow.
   */
  getCurrentStep(workflowId: string): WorkflowStepDefinition {
    const state = this.getWorkflowState(workflowId);
    return state.definition.steps[state.currentStepIndex];
  }

  /**
   * Get the current step index.
   */
  getCurrentStepIndex(workflowId: string): number {
    const state = this.getWorkflowState(workflowId);
    return state.currentStepIndex;
  }

  /**
   * Get the next step command to execute for a workflow.
   * Returns null if the workflow is completed.
   */
  getNextCommand(workflowId: string): { command: string; stepName: string; stepIndex: number } | null {
    const state = this.getWorkflowState(workflowId);
    if (state.status !== 'in_progress') {
      return null;
    }

    const step = state.definition.steps[state.currentStepIndex];
    return {
      command: step.command === 'custom' ? (step.customCommand ?? step.name) : step.command,
      stepName: step.name,
      stepIndex: state.currentStepIndex,
    };
  }

  /**
   * Auto-commit after successful verification.
   */
  async autoCommit(workflowId: string, config: AutoCommitConfig): Promise<string | null> {
    if (!config.enabled || !this.gitService) {
      return null;
    }

    const hasChanges = await this.gitService.hasUncommittedChanges();
    if (!hasChanges) {
      this.logger.debug('No uncommitted changes to auto-commit');
      return null;
    }

    const state = this.getWorkflowState(workflowId);
    const message = config.messageTemplate
      .replace('{taskId}', state.taskId)
      .replace('{workflowId}', state.workflowId)
      .replace('{step}', String(state.currentStepIndex + 1));

    const result = await this.gitService.commit(message);
    this.logger.info(`Auto-committed: ${result.hash} - ${result.message}`);
    return result.hash;
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private validateDefinition(definition: WorkflowDefinition): void {
    if (!definition.name || definition.name.trim().length === 0) {
      throw new WorkflowError('Workflow name is required');
    }

    if (!definition.steps || definition.steps.length === 0) {
      throw new WorkflowError('Workflow must have at least one step');
    }

    const names = new Set<string>();
    for (const step of definition.steps) {
      if (!step.name || step.name.trim().length === 0) {
        throw new WorkflowError('Each workflow step must have a name');
      }

      if (names.has(step.name)) {
        throw new WorkflowError(`Duplicate step name: ${step.name}`);
      }
      names.add(step.name);

      if (step.command === 'custom' && !step.customCommand) {
        throw new WorkflowError(`Custom step "${step.name}" must specify a customCommand`);
      }
    }
  }

  private parseWorkflowDefinitionFile(file: WorkflowDefinitionFile): WorkflowDefinition {
    const steps: WorkflowStepDefinition[] = file.steps.map((step, index) => {
      const command = this.mapCommand(step.command);
      return {
        id: createWorkflowStepDefId(index + 1),
        name: step.name,
        description: step.description ?? '',
        order: index + 1,
        command,
        customCommand: command === 'custom' ? step.customCommand : undefined,
        required: step.required ?? true,
      };
    });

    return {
      name: file.name,
      description: file.description,
      steps,
    };
  }

  private mapCommand(command?: string): WorkflowStepDefinition['command'] {
    switch (command) {
      case 'plan':
      case 'exec':
      case 'verify':
      case 'complete':
        return command;
      default:
        return command ? 'custom' : 'custom';
    }
  }

  private toDefinitionFile(definition: WorkflowDefinition): WorkflowDefinitionFile {
    return {
      name: definition.name,
      description: definition.description,
      steps: definition.steps.map((step) => ({
        name: step.name,
        description: step.description,
        command: step.command === 'custom' ? step.customCommand : step.command,
        required: step.required,
      })),
    };
  }

  private getStateFilePath(workflowId: string): string {
    return path.join(this.workflowsDir, 'states', `${workflowId}.json`);
  }

  private async saveState(state: WorkflowState): Promise<void> {
    try {
      const stateDir = path.join(this.workflowsDir, 'states');
      fs.mkdirSync(stateDir, { recursive: true });
      const filePath = this.getStateFilePath(state.workflowId);
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      this.logger.warn(`Failed to save workflow state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private loadState(workflowId: string): WorkflowState | null {
    try {
      const filePath = this.getStateFilePath(workflowId);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as WorkflowState;
    } catch (error) {
      this.logger.warn(`Failed to load workflow state: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
