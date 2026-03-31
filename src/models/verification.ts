export type VerificationCategory = 'critical' | 'major' | 'minor' | 'outdated';
export type VerificationCommentStatus = 'open' | 'fixed' | 'ignored';

export interface VerificationComment {
  id: string;
  category: VerificationCategory;
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
  status: VerificationCommentStatus;
}

export interface Verification {
  id: string;
  taskId: string;
  timestamp: string;
  comments: VerificationComment[];
  summary: string;
}

export function createVerificationId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `verif_${now}_${random}`;
}

export function createVerificationCommentId(): string {
  const now = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `vcomment_${now}_${random}`;
}
