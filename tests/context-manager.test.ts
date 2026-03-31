import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { ContextManager } from '../src/core/context-manager.js';

describe('ContextManager', () => {
  let tmpDir: string;
  let contextManager: ContextManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-ctx-test-'));
    contextManager = new ContextManager();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFile(relativePath: string, content: string): void {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  describe('gather()', () => {
    it('collects project summary with correct file counts', async () => {
      createFile('src/index.ts', 'export const x = 1;\nexport const y = 2;');
      createFile('src/utils.ts', 'export const z = 3;');

      const context = await contextManager.gather(tmpDir);

      expect(context.workingDirectory).toBe(path.resolve(tmpDir));
      expect(context.summary.totalFiles).toBe(2);
      expect(context.summary.totalLines).toBe(3);
      expect(context.summary.languages['typescript']).toEqual({ files: 2, lines: 3 });
    });

    it('loads package.json when present', async () => {
      createFile('package.json', JSON.stringify({ name: 'test-project', version: '1.0.0' }));
      createFile('src/index.ts', 'export const x = 1;');

      const context = await contextManager.gather(tmpDir);

      expect(context.packageJson).not.toBeNull();
      expect(context.packageJson!.name).toBe('test-project');
      expect(context.packageJson!.version).toBe('1.0.0');
    });

    it('returns null package.json when absent', async () => {
      createFile('src/index.ts', 'export const x = 1;');

      const context = await contextManager.gather(tmpDir);

      expect(context.packageJson).toBeNull();
    });
  });

  describe('gatherWithCodebase()', () => {
    it('returns codebase along with project context', async () => {
      createFile('src/index.ts', 'export function main() {}');

      const context = await contextManager.gatherWithCodebase(tmpDir);

      expect(context.codebase).toBeDefined();
      expect(context.codebase.files.length).toBe(1);
      expect(context.codebase.files[0].relativePath).toBe('src/index.ts');
      expect(context.summary).toBe(context.codebase.summary);
    });
  });

  describe('findAgentsMd()', () => {
    it('finds AGENTS.md in working directory', () => {
      createFile('AGENTS.md', '# Agent Configuration\nThis is the agents config.');
      createFile('src/index.ts', 'export const x = 1;');

      const content = contextManager.findAgentsMd(tmpDir);
      expect(content).not.toBeNull();
      expect(content).toContain('Agent Configuration');
    });

    it('finds AGENTS.md in parent directory', () => {
      createFile('AGENTS.md', '# Root Agents');
      createFile('subdir/src/index.ts', 'export const x = 1;');

      const content = contextManager.findAgentsMd(path.join(tmpDir, 'subdir'));
      expect(content).not.toBeNull();
      expect(content).toContain('Root Agents');
    });

    it('returns null when AGENTS.md does not exist', () => {
      createFile('src/index.ts', 'export const x = 1;');

      const content = contextManager.findAgentsMd(tmpDir);
      expect(content).toBeNull();
    });

    it('prefers closest AGENTS.md to the working directory', () => {
      createFile('AGENTS.md', '# Root Agents');
      createFile('subdir/AGENTS.md', '# Subdir Agents');
      createFile('subdir/src/index.ts', 'export const x = 1;');

      const content = contextManager.findAgentsMd(path.join(tmpDir, 'subdir'));
      expect(content).toContain('Subdir Agents');
    });
  });

  describe('loadProjectConfig()', () => {
    it('loads .sdd-tool/config.yaml when present', async () => {
      createFile('.sdd-tool/config.yaml', 'provider: anthropic\nlogLevel: debug');
      createFile('src/index.ts', 'export const x = 1;');

      const context = await contextManager.gather(tmpDir);

      expect(context.projectConfig).not.toBeNull();
      expect(context.projectConfig!.provider).toBe('anthropic');
      expect(context.projectConfig!.logLevel).toBe('debug');
    });

    it('returns null when config.yaml is absent', async () => {
      createFile('src/index.ts', 'export const x = 1;');

      const context = await contextManager.gather(tmpDir);

      expect(context.projectConfig).toBeNull();
    });
  });
});
