import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { FileAnalyzer } from '../src/core/file-analyzer.js';

describe('FileAnalyzer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traytor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFile(relativePath: string, content: string): void {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  function getFileByPath(codebase: Awaited<ReturnType<FileAnalyzer['analyze']>>, relativePath: string) {
    return codebase.files.find((f) => f.relativePath === relativePath);
  }

  describe('file scanning', () => {
    it('finds supported file types', async () => {
      createFile('src/index.ts', 'export const x = 1;');
      createFile('src/utils.js', 'module.exports = {}');
      createFile('src/app.py', 'def main(): pass');
      createFile('src/main.go', 'package main\nfunc main() {}');
      createFile('README.md', '# Hello');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();

      const extensions = codebase.files.map((f) => path.extname(f.relativePath));
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.js');
      expect(extensions).toContain('.py');
      expect(extensions).toContain('.go');
      expect(extensions).not.toContain('.md');
    });

    it('respects .gitignore patterns', async () => {
      createFile('.gitignore', 'build/\n*.log\ncoverage/');
      createFile('src/main.ts', 'export const x = 1;');
      createFile('build/bundle.js', 'const x = 1;');
      createFile('debug.log', 'error here');
      createFile('coverage/report.ts', 'export const report = {}');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();

      const paths = codebase.files.map((f) => f.relativePath);
      expect(paths).toContain('src/main.ts');
      expect(paths).not.toContain('build/bundle.js');
      expect(paths).not.toContain('debug.log');
      expect(paths).not.toContain('coverage/report.ts');
    });

    it('ignores node_modules and dist by default', async () => {
      createFile('src/index.ts', 'export const x = 1;');
      createFile('node_modules/pkg/index.ts', 'export const y = 2;');
      createFile('dist/index.js', 'const z = 3;');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();

      const paths = codebase.files.map((f) => f.relativePath);
      expect(paths).toContain('src/index.ts');
      expect(paths).not.toContain('node_modules/pkg/index.ts');
      expect(paths).not.toContain('dist/index.js');
    });
  });

  describe('language detection', () => {
    it('detects TypeScript from .ts extension', async () => {
      createFile('file.ts', 'const x = 1;');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('typescript');
    });

    it('detects TypeScript from .tsx extension', async () => {
      createFile('component.tsx', 'const X = () => <div/>;');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('typescript');
    });

    it('detects JavaScript from .js extension', async () => {
      createFile('utils.js', 'module.exports = {};');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('javascript');
    });

    it('detects Python from .py extension', async () => {
      createFile('script.py', 'def hello(): pass');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('python');
    });

    it('detects Go from .go extension', async () => {
      createFile('main.go', 'func main() {}');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('go');
    });

    it('detects Rust from .rs extension', async () => {
      createFile('main.rs', 'fn main() {}');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('rust');
    });

    it('detects Java from .java extension', async () => {
      createFile('Main.java', 'public class Main {}');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('java');
    });

    it('detects Vue from .vue extension', async () => {
      createFile('App.vue', '<template><div/></template>');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('vue');
    });

    it('detects Svelte from .svelte extension', async () => {
      createFile('App.svelte', '<script>let x = 1;</script>');
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      expect(codebase.files[0].language).toBe('svelte');
    });
  });

  describe('symbol extraction (TypeScript/JavaScript)', () => {
    it('extracts function declarations', async () => {
      createFile(
        'math.ts',
        `export function add(a: number, b: number): number {
  return a + b;
}`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'math.ts');

      const funcs = file!.symbols.filter((s) => s.kind === 'function');
      expect(funcs).toHaveLength(1);
      expect(funcs[0].name).toBe('add');
      expect(funcs[0].line).toBe(1);
    });

    it('extracts arrow functions assigned to const', async () => {
      createFile(
        'utils.ts',
        `export const multiply = (a: number, b: number) => {
  return a * b;
};

const privateHelper = () => {};`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'utils.ts');

      const funcs = file!.symbols.filter((s) => s.kind === 'function');
      expect(funcs.length).toBeGreaterThanOrEqual(2);
      const names = funcs.map((f) => f.name);
      expect(names).toContain('multiply');
      expect(names).toContain('privateHelper');
    });

    it('extracts async functions', async () => {
      createFile(
        'api.ts',
        `export async function fetchData(): Promise<string> {
  return '';
}`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'api.ts');

      const funcs = file!.symbols.filter((s) => s.kind === 'function');
      expect(funcs).toHaveLength(1);
      expect(funcs[0].name).toBe('fetchData');
    });

    it('extracts classes', async () => {
      createFile(
        'models.ts',
        `export class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

abstract class BaseEntity {
  id: string;
}`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'models.ts');

      const classes = file!.symbols.filter((s) => s.kind === 'class');
      expect(classes).toHaveLength(2);
      const names = classes.map((c) => c.name);
      expect(names).toContain('User');
      expect(names).toContain('BaseEntity');
    });

    it('extracts interfaces', async () => {
      createFile(
        'types.ts',
        `export interface User {
  id: string;
  name: string;
}

export interface Config {
  debug: boolean;
}`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'types.ts');

      const interfaces = file!.symbols.filter((s) => s.kind === 'interface');
      expect(interfaces).toHaveLength(2);
      const names = interfaces.map((i) => i.name);
      expect(names).toContain('User');
      expect(names).toContain('Config');
    });

    it('extracts type aliases', async () => {
      createFile(
        'aliases.ts',
        `export type Status = 'active' | 'inactive';
export type Handler<T> = (data: T) => void;`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'aliases.ts');

      const types = file!.symbols.filter((s) => s.kind === 'type');
      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('Status');
      expect(names).toContain('Handler');
    });

    it('extracts enums', async () => {
      createFile(
        'enum.ts',
        `export enum Color {
  Red = 'red',
  Blue = 'blue',
}`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'enum.ts');

      const enums = file!.symbols.filter((s) => s.kind === 'enum');
      expect(enums).toHaveLength(1);
      expect(enums[0].name).toBe('Color');
    });
  });

  describe('symbol extraction (Python)', () => {
    it('extracts Python functions', async () => {
      createFile(
        'utils.py',
        `def calculate_total(items):
    return sum(items)

def format_output(data):
    return str(data)`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'utils.py');

      const funcs = file!.symbols.filter((s) => s.kind === 'function');
      expect(funcs).toHaveLength(2);
      const names = funcs.map((f) => f.name);
      expect(names).toContain('calculate_total');
      expect(names).toContain('format_output');
    });

    it('extracts Python classes', async () => {
      createFile(
        'models.py',
        `class User:
    def __init__(self, name):
        self.name = name

class Admin(User):
    pass`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const file = getFileByPath(codebase, 'models.py');

      const classes = file!.symbols.filter((s) => s.kind === 'class');
      expect(classes).toHaveLength(2);
      const names = classes.map((c) => c.name);
      expect(names).toContain('User');
      expect(names).toContain('Admin');
    });
  });

  describe('directory structure tree', () => {
    it('builds a nested directory tree', async () => {
      createFile('src/index.ts', 'export const x = 1;');
      createFile('src/core/engine.ts', 'export class Engine {}');
      createFile('src/utils/helper.ts', 'export const help = 1;');
      createFile('tests/engine.test.ts', 'import {}');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();

      expect(codebase.structure.name).toBe(path.basename(tmpDir));
      expect(codebase.structure.children.length).toBeGreaterThanOrEqual(1);

      const src = codebase.structure.children.find((c) => c.name === 'src');
      expect(src).toBeDefined();
      expect(src!.children.find((c) => c.name === 'core')).toBeDefined();
      expect(src!.children.find((c) => c.name === 'utils')).toBeDefined();
      expect(src!.files).toContain('src/index.ts');
    });
  });

  describe('import/export maps', () => {
    it('builds import map from TypeScript files', async () => {
      createFile(
        'index.ts',
        `import { foo } from './utils';
import { bar } from './core/engine';`
      );
      createFile('utils.ts', 'export const foo = 1;');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();

      expect(codebase.imports['index.ts']).toBeDefined();
      expect(codebase.imports['index.ts']).toContain('./utils');
      expect(codebase.imports['index.ts']).toContain('./core/engine');
    });

    it('builds import map from Python files', async () => {
      createFile(
        'main.py',
        `from os import path
from collections import defaultdict
import json`
      );
      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();

      expect(codebase.imports['main.py']).toBeDefined();
      expect(codebase.imports['main.py'].length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('project summary', () => {
    it('calculates correct file counts and lines', async () => {
      createFile('a.ts', 'line1\nline2\nline3');
      createFile('b.ts', 'line1\nline2');
      createFile('c.py', 'line1');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();

      expect(codebase.summary.totalFiles).toBe(3);
      expect(codebase.summary.totalLines).toBe(6);
      expect(codebase.summary.languages['typescript']).toEqual({ files: 2, lines: 5 });
      expect(codebase.summary.languages['python']).toEqual({ files: 1, lines: 1 });
    });
  });

  describe('relevance scoring', () => {
    it('ranks files by filename match', async () => {
      createFile('auth.ts', 'export const auth = {}');
      createFile('auth.service.ts', 'export class AuthService {}');
      createFile('unrelated.ts', 'export const other = 1');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const relevant = analyzer.findRelevantFiles(codebase, 'auth');

      expect(relevant.length).toBeLessThanOrEqual(10);
      // auth-related files should appear before unrelated
      const paths = relevant.map((f) => f.relativePath);
      const unrelatedIdx = paths.indexOf('unrelated.ts');
      const authIdx = paths.indexOf('auth.ts');
      const authServiceIdx = paths.indexOf('auth.service.ts');
      expect(authIdx).toBeLessThan(unrelatedIdx);
      expect(authServiceIdx).toBeLessThan(unrelatedIdx);
    });

    it('ranks files by symbol name match', async () => {
      createFile('services.ts', 'export class AuthenticationProvider {}');
      createFile('models.ts', 'export class User {}');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const relevant = analyzer.findRelevantFiles(codebase, 'AuthenticationProvider');

      const paths = relevant.map((f) => f.relativePath);
      expect(paths[0]).toBe('services.ts');
    });

    it('ranks files by content keyword frequency (when filename is neutral)', async () => {
      // Use neutral filenames so content frequency is the differentiator
      createFile('heavy.ts', 'auth auth auth auth auth auth auth auth');
      createFile('light.ts', 'auth');

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const relevant = analyzer.findRelevantFiles(codebase, 'auth');

      const paths = relevant.map((f) => f.relativePath);
      // heavy.ts has more content matches for 'auth', but both have neutral filenames
      // Both get 0 filename points, but heavy.ts gets more content points
      expect(paths[0]).toBe('heavy.ts');
    });

    it('respects topN parameter', async () => {
      for (let i = 0; i < 15; i++) {
        createFile(`file${i}.ts`, `export const file${i} = ${i};`);
      }

      const analyzer = new FileAnalyzer(tmpDir);
      const codebase = await analyzer.analyze();
      const relevant = analyzer.findRelevantFiles(codebase, 'file', 5);

      expect(relevant.length).toBe(5);
    });
  });
});
