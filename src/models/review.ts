export type ReviewCategory = 'bug' | 'performance' | 'security' | 'clarity';
export type ReviewSeverity = 'critical' | 'major' | 'minor';

export interface ReviewComment {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface ReviewSummary {
  totalComments: number;
  byCategory: Record<ReviewCategory, number>;
  bySeverity: Record<ReviewSeverity, number>;
  overallAssessment: string;
  keyFindings: string[];
}

export type ReviewScope = 'uncommitted' | 'branch' | 'files' | 'all';

export interface Review {
  id: string;
  taskId: string;
  query: string;
  scope: ReviewScope;
  files: string[];
  comments: ReviewComment[];
  summary: ReviewSummary;
  timestamp: string;
}

export function createReviewId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `review_${now}_${random}`;
}

export function createReviewCommentId(): string {
  const now = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `rcomment_${now}_${random}`;
}
