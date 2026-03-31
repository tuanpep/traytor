import type { Verification } from './verification.js';

export interface Review {
  id: string;
  files: string[];
  verification: Verification;
}

export function createReviewId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `review_${now}_${random}`;
}
