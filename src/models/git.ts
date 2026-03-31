export type GitDiffFileType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface GitDiff {
  file: string;
  oldFile?: string;
  type: GitDiffFileType;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface GitDiffResult {
  from: string;
  to: string;
  files: GitDiff[];
  totalAdditions: number;
  totalDeletions: number;
  totalChanges: number;
}

export interface GitCommitResult {
  hash: string;
  message: string;
  files: string[];
}

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitStatusInfo {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}
