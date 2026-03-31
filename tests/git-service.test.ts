import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { GitService } from '../src/services/git-service.js';
import { execSync } from 'node:child_process';

describe('GitService', () => {
  let tmpDir: string;
  let gitService: GitService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-git-test-'));
    gitService = new GitService(tmpDir);

    // Initialize a git repo in tmpDir
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

    // Create an initial commit so branch operations work
    createFile('.gitkeep', '');
    execSync('git add .gitkeep', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFile(relativePath: string, content: string): void {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  describe('isRepository()', () => {
    it('returns true for a git repository', async () => {
      const result = await gitService.isRepository();
      expect(result).toBe(true);
    });

    it('returns false for a non-git directory', async () => {
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-non-git-'));
      const service = new GitService(nonGitDir);
      const result = await service.isRepository();
      expect(result).toBe(false);
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    });
  });

  describe('getCurrentBranch()', () => {
    it('returns the current branch name', async () => {
      const branch = await gitService.getCurrentBranch();
      expect(['main', 'master']).toContain(branch);
    });
  });

  describe('commit()', () => {
    it('creates a commit with all changes when no files specified', async () => {
      createFile('test.txt', 'hello world');
      execSync('git add test.txt', { cwd: tmpDir, stdio: 'pipe' });

      const result = await gitService.commit('initial commit');

      expect(result.hash).toBeTruthy();
      expect(result.message).toBe('initial commit');
    });

    it('creates a commit with specific files', async () => {
      createFile('a.txt', 'aaa');
      createFile('b.txt', 'bbb');

      const result = await gitService.commit('commit specific', ['a.txt']);

      expect(result.hash).toBeTruthy();
      expect(result.message).toBe('commit specific');
    });
  });

  describe('getDiff()', () => {
    it('returns empty diff for clean working tree', async () => {
      // Create and commit a file
      createFile('test.txt', 'original');
      await gitService.commit('initial');

      const result = await gitService.getDiff();

      expect(result.files.length).toBe(0);
      expect(result.totalAdditions).toBe(0);
      expect(result.totalDeletions).toBe(0);
    });

    it('returns diff for unstaged changes', async () => {
      // Create and commit a file
      createFile('test.txt', 'original');
      await gitService.commit('initial');

      // Modify the file
      createFile('test.txt', 'modified');

      const result = await gitService.getDiff();

      expect(result.files.length).toBe(1);
      expect(result.files[0].file).toBe('test.txt');
      expect(result.files[0].type).toBe('modified');
      expect(result.files[0].additions).toBe(1);
      expect(result.files[0].deletions).toBe(1);
    });

    it('returns diff against a ref', async () => {
      // Create and commit a file
      createFile('test.txt', 'original');
      await gitService.commit('initial');

      // Create a new commit
      createFile('new.txt', 'new file');
      await gitService.commit('second');

      // Diff against initial commit
      const log = execSync('git log --format=%H', { cwd: tmpDir, stdio: 'pipe' }).toString().trim();
      const commits = log.split('\n');
      const initialCommit = commits[1];

      const result = await gitService.getDiff(initialCommit);

      expect(result.files.length).toBe(1);
      expect(result.files[0].file).toBe('new.txt');
      expect(result.files[0].type).toBe('added');
    });
  });

  describe('getDiffBetween()', () => {
    it('returns diff between two refs', async () => {
      createFile('a.txt', 'aaa');
      await gitService.commit('first');

      createFile('b.txt', 'bbb');
      await gitService.commit('second');

      createFile('c.txt', 'ccc');
      await gitService.commit('third');

      const log = execSync('git log --format=%H', { cwd: tmpDir, stdio: 'pipe' }).toString().trim();
      const commits = log.split('\n');

      const result = await gitService.getDiffBetween(commits[2], commits[0]);

      expect(result.files.length).toBeGreaterThan(0);
    });
  });

  describe('parseDiff()', () => {
    it('parses a valid diff output', () => {
      const diffOutput = [
        'diff --git a/src/index.ts b/src/index.ts',
        'index abc123..def456 100644',
        '--- a/src/index.ts',
        '+++ b/src/index.ts',
        '@@ -1,3 +1,4 @@',
        ' import { x } from "./x";',
        '+import { y } from "./y";',
        ' export function main() {}',
        '-export function old() {}',
      ].join('\n');

      const files = gitService.parseDiff(diffOutput);

      expect(files.length).toBe(1);
      expect(files[0].file).toBe('src/index.ts');
      expect(files[0].type).toBe('modified');
      expect(files[0].additions).toBe(1);
      expect(files[0].deletions).toBe(1);
    });

    it('parses a new file diff', () => {
      const diffOutput = [
        'diff --git a/newfile.ts b/newfile.ts',
        'new file mode 100644',
        'index 0000000..abc1234',
        '--- /dev/null',
        '+++ b/newfile.ts',
        '@@ -0,0 +1,3 @@',
        '+export const x = 1;',
        '+export const y = 2;',
        '+export const z = 3;',
      ].join('\n');

      const files = gitService.parseDiff(diffOutput);

      expect(files.length).toBe(1);
      expect(files[0].file).toBe('newfile.ts');
      expect(files[0].type).toBe('added');
      expect(files[0].additions).toBe(3);
      expect(files[0].deletions).toBe(0);
    });

    it('parses a deleted file diff', () => {
      const diffOutput = [
        'diff --git a/oldfile.ts b/oldfile.ts',
        'deleted file mode 100644',
        'index abc1234..0000000',
        '--- a/oldfile.ts',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-export const old = 1;',
        '-export const gone = 2;',
      ].join('\n');

      const files = gitService.parseDiff(diffOutput);

      expect(files.length).toBe(1);
      expect(files[0].file).toBe('oldfile.ts');
      expect(files[0].type).toBe('deleted');
      expect(files[0].additions).toBe(0);
      expect(files[0].deletions).toBe(2);
    });

    it('parses a renamed file diff', () => {
      const diffOutput = [
        'diff --git a/oldname.ts b/newname.ts',
        'similarity index 100%',
        'rename from oldname.ts',
        'rename to newname.ts',
      ].join('\n');

      const files = gitService.parseDiff(diffOutput);

      expect(files.length).toBe(1);
      expect(files[0].file).toBe('newname.ts');
      expect(files[0].oldFile).toBe('oldname.ts');
      expect(files[0].type).toBe('renamed');
    });

    it('returns empty array for empty diff', () => {
      const files = gitService.parseDiff('');
      expect(files.length).toBe(0);
    });
  });

  describe('hasUncommittedChanges()', () => {
    it('returns false for clean working tree', async () => {
      createFile('test.txt', 'content');
      await gitService.commit('initial');

      const result = await gitService.hasUncommittedChanges();
      expect(result).toBe(false);
    });

    it('returns true when there are unstaged changes', async () => {
      createFile('test.txt', 'content');
      await gitService.commit('initial');

      createFile('test.txt', 'modified');

      const result = await gitService.hasUncommittedChanges();
      expect(result).toBe(true);
    });

    it('returns true when there are untracked files', async () => {
      createFile('test.txt', 'content');
      await gitService.commit('initial');

      createFile('untracked.txt', 'new');

      const result = await gitService.hasUncommittedChanges();
      expect(result).toBe(true);
    });
  });

  describe('getChangedFiles()', () => {
    it('returns list of changed files', async () => {
      createFile('a.txt', 'aaa');
      await gitService.commit('initial');

      createFile('a.txt', 'modified');
      createFile('b.txt', 'new');

      const files = await gitService.getChangedFiles();

      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('getStatus()', () => {
    it('returns status for clean working tree', async () => {
      createFile('test.txt', 'content');
      await gitService.commit('initial');

      const status = await gitService.getStatus();

      expect(['main', 'master']).toContain(status.branch);
      expect(status.staged.length).toBe(0);
      expect(status.unstaged.length).toBe(0);
    });
  });

  describe('getBranches()', () => {
    it('returns list of branches', async () => {
      const branches = await gitService.getBranches();

      expect(branches.length).toBe(1);
      expect(['main', 'master']).toContain(branches[0].name);
      expect(branches[0].isCurrent).toBe(true);
    });

    it('returns multiple branches', async () => {
      // Get current branch name
      const currentBranch = await gitService.getCurrentBranch();

      execSync('git checkout -b feature', { cwd: tmpDir, stdio: 'pipe' });
      execSync(`git checkout ${currentBranch}`, { cwd: tmpDir, stdio: 'pipe' });

      const branches = await gitService.getBranches();

      expect(branches.length).toBe(2);
      expect(branches.find((b) => b.name === 'feature')!.isCurrent).toBe(false);
      expect(branches.find((b) => b.name === currentBranch)!.isCurrent).toBe(true);
    });
  });
});
