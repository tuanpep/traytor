import { simpleGit, type SimpleGit } from 'simple-git';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';
import { GitError } from '../utils/errors.js';
import type {
  GitDiff,
  GitDiffResult,
  GitDiffFileType,
  GitCommitResult,
  GitBranchInfo,
  GitStatusInfo,
} from '../models/git.js';

export class GitService {
  private git: SimpleGit;
  private logger = getLogger();

  constructor(private readonly basePath?: string) {
    this.git = simpleGit(this.basePath ?? process.cwd());
  }

  /**
   * Check if the current directory (or basePath) is inside a git repository.
   */
  async isRepository(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  /**
   * Get the current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    try {
      return await this.git.revparse(['--abbrev-ref', 'HEAD']);
    } catch (error) {
      throw new GitError(
        'Failed to get current branch',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get a structured diff against a ref (branch, commit, or tag).
   * If no ref is provided, returns diff of unstaged changes.
   */
  async getDiff(ref?: string): Promise<GitDiffResult> {
    try {
      this.logger.debug(`Getting diff${ref ? ` against ${ref}` : ' of unstaged changes'}`);

      let diffOutput: string;

      if (ref) {
        diffOutput = await this.git.diff([ref]);
      } else {
        diffOutput = await this.git.diff();
      }

      const files = this.parseDiff(diffOutput);

      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
      const totalChanges = files.reduce((sum, f) => sum + f.changes, 0);

      return {
        from: ref ?? 'working_tree',
        to: 'HEAD',
        files,
        totalAdditions,
        totalDeletions,
        totalChanges,
      };
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw new GitError(
        `Failed to get diff${ref ? ` against ${ref}` : ''}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get a structured diff between two refs.
   */
  async getDiffBetween(fromRef: string, toRef: string): Promise<GitDiffResult> {
    try {
      this.logger.debug(`Getting diff between ${fromRef} and ${toRef}`);

      const diffOutput = await this.git.diff([fromRef, toRef]);
      const files = this.parseDiff(diffOutput);

      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
      const totalChanges = files.reduce((sum, f) => sum + f.changes, 0);

      return {
        from: fromRef,
        to: toRef,
        files,
        totalAdditions,
        totalDeletions,
        totalChanges,
      };
    } catch (error) {
      throw new GitError(
        `Failed to get diff between ${fromRef} and ${toRef}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get the diff of staged changes.
   */
  async getStagedDiff(): Promise<GitDiffResult> {
    try {
      this.logger.debug('Getting staged diff');

      const diffOutput = await this.git.diff(['--cached']);
      const files = this.parseDiff(diffOutput);

      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
      const totalChanges = files.reduce((sum, f) => sum + f.changes, 0);

      return {
        from: 'INDEX',
        to: 'HEAD',
        files,
        totalAdditions,
        totalDeletions,
        totalChanges,
      };
    } catch (error) {
      throw new GitError(
        'Failed to get staged diff',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Create a git commit with the given message, optionally specifying which files to commit.
   */
  async commit(message: string, files?: string[]): Promise<GitCommitResult> {
    try {
      this.logger.debug(`Creating commit: "${message}"`);

      // Get the list of changed files before staging
      const changedFiles = await this.getChangedFiles();

      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add('-A');
      }

      const result = await this.git.commit(message);

      return {
        hash: result.commit,
        message,
        files: changedFiles,
      };
    } catch (error) {
      throw new GitError(
        `Failed to commit: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get list of files changed compared to a ref.
   */
  async getChangedFiles(ref?: string): Promise<string[]> {
    try {
      if (ref) {
        const output = await this.git.diff(['--name-only', ref]);
        return output.split('\n').filter(Boolean);
      }

      const output = await this.git.diff(['--name-only']);
      return output.split('\n').filter(Boolean);
    } catch (error) {
      throw new GitError(
        `Failed to get changed files${ref ? ` for ${ref}` : ''}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get list of staged files.
   */
  async getStagedFiles(): Promise<string[]> {
    try {
      const output = await this.git.diff(['--name-only', '--cached']);
      return output.split('\n').filter(Boolean);
    } catch (error) {
      throw new GitError(
        'Failed to get staged files',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Check if there are uncommitted changes.
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.git.status();
      return status.modified.length > 0 ||
        status.created.length > 0 ||
        status.deleted.length > 0 ||
        status.staged.length > 0 ||
        status.not_added.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get the full git status.
   */
  async getStatus(): Promise<GitStatusInfo> {
    try {
      const status = await this.git.status();
      const branch = await this.getCurrentBranch();

      let ahead = 0;
      let behind = 0;
      if (status.ahead) ahead = status.ahead;
      if (status.behind) behind = status.behind;

      return {
        branch,
        ahead,
        behind,
        staged: status.staged,
        unstaged: status.modified,
        untracked: status.not_added,
      };
    } catch (error) {
      throw new GitError(
        'Failed to get git status',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get list of branches.
   */
  async getBranches(): Promise<GitBranchInfo[]> {
    try {
      const branches = await this.git.branchLocal();
      const current = branches.current;

      return branches.all.map((name) => ({
        name,
        isCurrent: name === current,
        isRemote: false,
      }));
    } catch (error) {
      throw new GitError(
        'Failed to get branches',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Parse raw git diff output into structured GitDiff objects.
   */
  parseDiff(diffOutput: string): GitDiff[] {
    const files: GitDiff[] = [];

    // Split by file headers: diff --git a/... b/...
    const fileBlocks = diffOutput.split(/^diff --git /m).filter(Boolean);

    for (const block of fileBlocks) {
      const parsed = this.parseFileDiffBlock(block);
      if (parsed) {
        files.push(parsed);
      }
    }

    return files;
  }

  /**
   * Parse a single file diff block.
   */
  private parseFileDiffBlock(block: string): GitDiff | null {
    const lines = block.split('\n');
    if (lines.length === 0) return null;

    // Extract file paths from the first line: a/path b/path
    const headerMatch = lines[0].match(/^a\/(.+?)\s+b\/(.+)$/);
    if (!headerMatch) return null;

    const oldFile = headerMatch[1];
    const newFile = headerMatch[2];

    // Determine file type
    let type: GitDiffFileType = 'modified';
    if (oldFile === '/dev/null') {
      type = 'added';
    } else if (newFile === '/dev/null') {
      type = 'deleted';
    } else if (oldFile !== newFile) {
      type = 'renamed';
    }

    // Count additions and deletions from hunks
    let additions = 0;
    let deletions = 0;
    const patchLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
        patchLines.push(line);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
        patchLines.push(line);
      }
    }

    const filePath = type === 'deleted' ? oldFile : newFile;

    return {
      file: filePath,
      oldFile: type === 'renamed' ? oldFile : undefined,
      type,
      additions,
      deletions,
      changes: additions + deletions,
      patch: patchLines.join('\n'),
    };
  }

  /**
   * Resolve a file path relative to the repository root.
   */
  resolvePath(filePath: string): string {
    if (this.basePath) {
      return path.resolve(this.basePath, filePath);
    }
    return path.resolve(process.cwd(), filePath);
  }
}
