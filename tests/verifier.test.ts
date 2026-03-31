import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock file analyzer
vi.mock('../src/core/file-analyzer.js', () => ({
  FileAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockResolvedValue({
      rootPath: '/test',
      files: [
        {
          path: '/test/src/index.ts',
          relativePath: 'src/index.ts',
          language: 'typescript',
          size: 100,
          lineCount: 10,
          symbols: [],
          imports: [],
          exports: [],
        },
        {
          path: '/test/src/utils.ts',
          relativePath: 'src/utils.ts',
          language: 'typescript',
          size: 200,
          lineCount: 20,
          symbols: [],
          imports: [],
          exports: [],
        },
      ],
      structure: { name: 'test', path: '/test', children: [], files: [] },
      imports: {},
      exports: {},
      summary: {
        totalFiles: 2,
        totalLines: 30,
        languages: { typescript: { files: 2, lines: 30 } },
      },
    }),
    findRelevantFiles: vi.fn().mockReturnValue([]),
  })),
}));

// Mock template engine
vi.mock('../src/services/template-engine.js', () => ({
  TemplateEngine: vi.fn().mockImplementation(() => ({
    renderVerificationTemplate: vi.fn().mockReturnValue('verification prompt'),
  })),
}));

import fs from 'node:fs';
import { Verifier } from '../src/core/verifier.js';
import type { Task } from '../src/models/task.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockLLMService(responseContent: string): any {
  return {
    complete: vi.fn().mockResolvedValue({
      content: responseContent,
      usage: { inputTokens: 100, outputTokens: 200 },
      model: 'claude-sonnet-4-20250514',
    }),
    getStepOptions: vi.fn().mockReturnValue({}),
    getTotalUsage: vi.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
  };
}

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
          title: 'Create index file',
          description: 'Create the main index.ts file',
          files: ['src/index.ts'],
        },
        {
          id: 'step_2',
          title: 'Create utils file',
          description: 'Create the utils.ts file',
          files: ['src/utils.ts'],
        },
      ],
      rationale: 'Need these files for the project',
      iterations: [],
    },
    executions: [],
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const SAMPLE_LLM_RESPONSE = `
### Verification Summary
- [x] All plan steps are implemented
- [x] No unintended side effects introduced
- [x] Code follows project conventions

### Issues Found

1. **File:** \`src/index.ts\`
   **Severity:** error
   **Description:** Missing error handling for the main function
   **Suggestion:** Add try-catch block around the main function call

2. **File:** \`src/utils.ts\`
   **Severity:** warning
   **Description:** Function does not handle timezone correctly
   **Suggestion:** Use UTC timezone for consistent date formatting

3. **File:** \`src/utils.ts\`
   **Severity:** suggestion
   **Description:** Consider adding JSDoc comments for better documentation
   **Suggestion:** Add JSDoc to exported functions

### Overall Assessment
APPROVED
`;

describe('Verifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw if task has no plan', async () => {
    const llmService = createMockLLMService('');
    const verifier = new Verifier(llmService, '/test');
    const task = createMockTask({ plan: undefined });

    await expect(verifier.verify(task)).rejects.toThrow('has no plan to verify against');
  });

  it('should parse verification response with severity categories', async () => {
    const llmService = createMockLLMService(SAMPLE_LLM_RESPONSE);
    const verifier = new Verifier(llmService, '/test');
    const task = createMockTask();

    vi.spyOn(fs, 'readFileSync').mockReturnValue('export const test = 1;');

    const result = await verifier.verify(task);

    expect(result.id).toMatch(/^verif_/);
    expect(result.taskId).toBe('task_test_123');
    expect(result.timestamp).toBeDefined();
    // Should find comments from the parsed response
    expect(result.comments.length).toBeGreaterThanOrEqual(3);

    // Check that we have at least one comment per expected category
    const categories = result.comments.map((c) => c.category);
    expect(categories).toContain('critical');
    expect(categories).toContain('major');
    expect(categories).toContain('minor');

    // Verify comment structure
    const criticalComment = result.comments.find((c) => c.category === 'critical');
    expect(criticalComment).toBeDefined();
    expect(criticalComment!.file).toBe('src/index.ts');
    expect(criticalComment!.message).toContain('error handling');
    expect(criticalComment!.suggestion).toContain('try-catch');
  });

  it('should handle LLM failures with retries', async () => {
    const llmService = {
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          content: SAMPLE_LLM_RESPONSE,
          usage: { inputTokens: 100, outputTokens: 200 },
          model: 'claude-sonnet-4-20250514',
        }),
      getStepOptions: vi.fn().mockReturnValue({}),
    };

    const verifier = new Verifier(llmService as any, '/test');
    const task = createMockTask();

    vi.spyOn(fs, 'readFileSync').mockReturnValue('export const test = 1;');

    const result = await verifier.verify(task);

    expect(llmService.complete).toHaveBeenCalledTimes(3);
    expect(result.comments.length).toBeGreaterThanOrEqual(1);
  });

  it('should exhaust retries and throw on persistent LLM failures', async () => {
    const llmService = {
      complete: vi.fn().mockRejectedValue(new Error('Persistent API error')),
      getStepOptions: vi.fn().mockReturnValue({}),
    };

    const verifier = new Verifier(llmService as any, '/test');
    const task = createMockTask();

    vi.spyOn(fs, 'readFileSync').mockReturnValue('export const test = 1;');

    await expect(verifier.verify(task)).rejects.toThrow('LLM verification failed after 3 attempts');
    expect(llmService.complete).toHaveBeenCalledTimes(3);
  });

  it('should detect missing files in implementation', async () => {
    const llmService = createMockLLMService('No issues found.');
    const verifier = new Verifier(llmService, '/test');

    const task = createMockTask();
    task.plan!.steps.push({
      id: 'step_3',
      title: 'Create missing file',
      description: 'Create a file that does not exist',
      files: ['src/missing.ts'],
    });

    vi.spyOn(fs, 'readFileSync').mockReturnValue('export const test = 1;');

    const result = await verifier.verify(task);

    expect(result.summary).toContain('Missing files');
    expect(result.summary).toContain('src/missing.ts');
  });

  it('should handle empty verification response', async () => {
    const llmService = createMockLLMService('Everything looks good. No issues found.');
    const verifier = new Verifier(llmService, '/test');
    const task = createMockTask();

    vi.spyOn(fs, 'readFileSync').mockReturnValue('export const test = 1;');

    const result = await verifier.verify(task);

    expect(result.comments.length).toBe(0);
    expect(result.summary).toContain('0 issue(s)');
  });

  it('should parseVerificationResponse correctly maps severities', () => {
    const llmService = createMockLLMService('');
    const verifier = new Verifier(llmService, '/test');

    // Use numbered issue format (the primary format the parser handles)
    const response = `
1. **File:** \`test.ts\`
   **Severity:** critical
   **Description:** This is a critical issue
   **Suggestion:** Fix it

2. **File:** \`test2.ts\`
   **Severity:** warning
   **Description:** This is a warning
   **Suggestion:** Address it

3. **File:** \`test3.ts\`
   **Severity:** suggestion
   **Description:** This is a suggestion
   **Suggestion:** Consider it

4. **File:** \`test4.ts\`
   **Severity:** outdated
   **Description:** This is outdated
   **Suggestion:** Remove it
`;

    const comments = verifier.parseVerificationResponse(response);
    expect(comments.length).toBe(4);

    // Check severity mapping
    const categories = comments.map((c) => c.category);
    expect(categories).toContain('critical');
    expect(categories).toContain('major');
    expect(categories).toContain('minor');
    expect(categories).toContain('outdated');
  });

  it('should handle NEEDS_CHANGES assessment in summary', async () => {
    const responseWithCritical = `
1. **File:** \`src/index.ts\`
   **Severity:** error
   **Description:** Critical bug in implementation
   **Suggestion:** Fix the bug
`;

    const llmService = createMockLLMService(responseWithCritical);
    const verifier = new Verifier(llmService, '/test');
    const task = createMockTask();

    vi.spyOn(fs, 'readFileSync').mockReturnValue('export const test = 1;');

    const result = await verifier.verify(task);

    expect(result.summary).toContain('NEEDS_CHANGES');
  });

  it('should respect custom maxRetries option', async () => {
    const llmService = {
      complete: vi.fn().mockRejectedValue(new Error('API error')),
      getStepOptions: vi.fn().mockReturnValue({}),
    };

    const verifier = new Verifier(llmService as any, '/test');
    const task = createMockTask();

    vi.spyOn(fs, 'readFileSync').mockReturnValue('export const test = 1;');

    await expect(verifier.verify(task, { maxRetries: 1 })).rejects.toThrow(
      'LLM verification failed after 1 attempt'
    );

    expect(llmService.complete).toHaveBeenCalledTimes(1);
  });
});
