import { simpleGit, type SimpleGit } from 'simple-git';
import { getLogger } from '../utils/logger.js';

export interface GitDiffResult {
  diff: string;
  files: string[];
  ref: string;
}

export class GitDiffService {
  private logger = getLogger();
  private git: SimpleGit;

  constructor(private readonly workingDir: string) {
    this.git = simpleGit(workingDir);
  }

  async getDiff(target: string = 'uncommitted'): Promise<GitDiffResult | null> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        this.logger.debug('Not a git repository, skipping diff');
        return null;
      }

      let diff: string;
      let files: string[];
      let ref: string;

      if (target === 'uncommitted') {
        diff = await this.git.diff();
        files = await this.getChangedFiles();
        ref = 'HEAD';
      } else if (target === 'main') {
        const mainBranch = await this.findDefaultBranch();
        if (!mainBranch) {
          this.logger.debug('No default branch found, skipping diff');
          return null;
        }
        diff = await this.git.diff([`${mainBranch}...HEAD`]);
        files = await this.getChangedFilesSince(mainBranch);
        ref = mainBranch;
      } else if (target.startsWith('branch:')) {
        const branch = target.slice(7);
        diff = await this.git.diff([`${branch}...HEAD`]);
        files = await this.getChangedFilesSince(branch);
        ref = branch;
      } else if (target.startsWith('commit:')) {
        const commit = target.slice(7);
        diff = await this.git.diff([`${commit}...HEAD`]);
        files = await this.getChangedFilesSince(commit);
        ref = commit;
      } else {
        this.logger.warn(`Unknown diff target: ${target}`);
        return null;
      }

      if (!diff || diff.trim().length === 0) {
        this.logger.debug('No changes detected');
        return null;
      }

      this.logger.info(`Git diff against ${ref}: ${files.length} files changed`);
      return { diff, files, ref };
    } catch (error) {
      this.logger.warn(
        `Failed to get git diff: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private async findDefaultBranch(): Promise<string | null> {
    const candidates = ['main', 'master', 'develop'];
    for (const branch of candidates) {
      try {
        await this.git.revparse([branch]);
        return branch;
      } catch {
        // Branch doesn't exist, try next
      }
    }
    return null;
  }

  private async getChangedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map((r) => r.to),
    ];
  }

  private async getChangedFilesSince(ref: string): Promise<string[]> {
    try {
      const result = await this.git.diff(['--name-only', `${ref}...HEAD`]);
      return result.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
