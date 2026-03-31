import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

// Mock child_process before importing the service
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { AgentService } from '../src/services/agent-service.js';
import type { Task } from '../src/models/task.js';
import type { Config } from '../src/config/schema.js';

function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task_test_123',
    type: 'plan',
    query: 'Test task',
    status: 'completed',
    context: { files: [], folders: [] },
    plan: {
      id: 'plan_test_123',
      steps: [
        {
          id: 'step_1',
          title: 'Step 1',
          description: 'Do something',
          files: ['src/index.ts'],
        },
      ],
      rationale: 'Because we need to',
      iterations: [],
    },
    executions: [],
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockConfig(overrides?: Partial<Config>): Config {
  return {
    provider: 'anthropic',
    anthropic: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0,
    },
    openai: {
      model: 'gpt-4o',
      maxTokens: 4096,
      temperature: 0,
    },
    agents: [],
    dataDir: '~/.sdd-tool/data',
    logLevel: 'info',
    verification: {
      autoVerify: false,
      maxRetries: 3,
    },
    ...overrides,
  };
}

describe('AgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for spawn - simulates a successful process
    mockSpawn.mockReturnValue({
      stdout: { on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') setTimeout(() => cb(Buffer.from('output')), 10);
      }) },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'close') setTimeout(() => cb(0), 20);
        if (event === 'exit') setTimeout(() => cb(0), 20);
      }),
      kill: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw if task has no plan', async () => {
    const service = new AgentService(createMockConfig());
    const task = createMockTask({ plan: undefined });

    await expect(service.execute(task)).rejects.toThrow('has no plan to execute');
  });

  it('should render plan prompt correctly', () => {
    const service = new AgentService(createMockConfig());
    const task = createMockTask();

    const prompt = service.renderPlanPrompt(task, task.plan!);

    expect(prompt).toContain('Test task');
    expect(prompt).toContain('Step 1');
    expect(prompt).toContain('src/index.ts');
  });

  it('should spawn agent process with correct env vars', async () => {
    const service = new AgentService(createMockConfig());
    const task = createMockTask();

    await service.execute(task);

    expect(mockSpawn).toHaveBeenCalled();
    const spawnArgs = mockSpawn.mock.calls[0];
    expect(spawnArgs[0]).toBe('claude');

    const spawnOptions = spawnArgs[2];
    expect(spawnOptions.env.TRAYCER_PROMPT).toContain('Test task');
    expect(spawnOptions.env.TRAYCER_PROMPT_TMP_FILE).toBeDefined();
    expect(spawnOptions.env.TRAYCER_TASK_ID).toBe('task_test_123');
    expect(spawnOptions.env.TRAYCER_SYSTEM_PROMPT).toContain('task_test_123');
  });

  it('should write prompt to temp file and clean up', async () => {
    const service = new AgentService(createMockConfig());
    const task = createMockTask();

    const tmpFilesCreated: string[] = [];
    const originalWriteFileSync = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView) => {
      tmpFilesCreated.push(String(file));
      return originalWriteFileSync(file, data, 'utf-8');
    });

    await service.execute(task);

    // Should have created a temp file
    expect(tmpFilesCreated.length).toBeGreaterThan(0);
    expect(tmpFilesCreated[0]).toContain('sdd-prompt-');

    vi.restoreAllMocks();
  });

  it('should use configured agent when available', async () => {
    const config = createMockConfig({
      agents: [
        {
          name: 'custom-agent',
          command: 'my-agent',
          args: ['--yes'],
          env: { CUSTOM_VAR: 'value' },
          timeout: 600_000,
        },
      ],
    });
    const service = new AgentService(config);
    const task = createMockTask();

    await service.execute(task);

    expect(mockSpawn).toHaveBeenCalled();
    const spawnArgs = mockSpawn.mock.calls[0];
    expect(spawnArgs[0]).toBe('my-agent');
    expect(spawnArgs[1]).toEqual(['--yes']);
  });

  it('should handle agent process errors', async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error('Command not found');
    });

    const service = new AgentService(createMockConfig());
    const task = createMockTask();

    await expect(service.execute(task)).rejects.toThrow('Failed to spawn agent');
  });

  it('should report failure when agent exits with non-zero code', async () => {
    mockSpawn.mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') setTimeout(() => cb(Buffer.from('error output')), 10);
      }) },
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'close') setTimeout(() => cb(1), 20);
        if (event === 'exit') setTimeout(() => cb(1), 20);
      }),
      kill: vi.fn(),
    });

    const service = new AgentService(createMockConfig());
    const task = createMockTask();

    const result = await service.execute(task);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});
