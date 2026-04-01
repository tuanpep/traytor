import { describe, expect, it } from 'vitest';

import {
  AgentExecutionError,
  ConfigError,
  FileNotFoundError,
  LLMProviderError,
  PlanGenerationError,
  TemplateError,
  TraytorError,
  TaskNotFoundError,
  VerificationError,
} from '../../src/utils/errors.js';

describe('TraytorError hierarchy', () => {
  it('creates task not found error with code and details', () => {
    const error = new TaskNotFoundError('task_123');

    expect(error).toBeInstanceOf(TraytorError);
    expect(error.code).toBe('TASK_NOT_FOUND');
    expect(error.details).toEqual({ taskId: 'task_123' });
    expect(error.suggestion).toContain('traytor history');
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

describe('ConfigError', () => {
  it('maps to CONFIG_INVALID code', () => {
    const error = new ConfigError('missing provider');
    expect(error).toBeInstanceOf(TraytorError);
    expect(error.code).toBe('CONFIG_INVALID');
    expect(error.name).toBe('ConfigError');
    expect(error.message).toContain('missing provider');
    expect(error.suggestion).toContain('config');
  });
});

describe('FileNotFoundError', () => {
  it('maps to FILE_NOT_FOUND code with filePath in details', () => {
    const error = new FileNotFoundError('/missing/file.ts');
    expect(error).toBeInstanceOf(TraytorError);
    expect(error.code).toBe('FILE_NOT_FOUND');
    expect(error.name).toBe('FileNotFoundError');
    expect(error.details).toEqual({ filePath: '/missing/file.ts' });
  });

  it('preserves additional details', () => {
    const error = new FileNotFoundError('src/index.ts', { workingDir: '/home/user' });
    expect(error.details).toEqual({ filePath: 'src/index.ts', workingDir: '/home/user' });
  });
});

describe('TemplateError', () => {
  it('maps to TEMPLATE_ERROR code', () => {
    const error = new TemplateError('invalid handlebars syntax');
    expect(error).toBeInstanceOf(TraytorError);
    expect(error.code).toBe('TEMPLATE_ERROR');
    expect(error.name).toBe('TemplateError');
    expect(error.message).toContain('invalid handlebars syntax');
  });
});

describe('LLMProviderError', () => {
  it('maps to LLM_API_ERROR code', () => {
    const error = new LLMProviderError('anthropic', 'rate limited');
    expect(error).toBeInstanceOf(TraytorError);
    expect(error.code).toBe('LLM_API_ERROR');
    expect(error.name).toBe('LLMProviderError');
  });
});
