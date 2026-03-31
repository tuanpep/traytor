import { z } from 'zod';

export const TaskQuerySchema = z.object({
  query: z.string().min(1, 'Query is required and cannot be empty'),
  mode: z.enum(['plan', 'phases', 'review', 'epic']).default('plan'),
  files: z.array(z.string()).default([]),
  folders: z.array(z.string()).default([]),
  context: z.string().optional(),
});

export type TaskQuery = z.infer<typeof TaskQuerySchema>;

export const TaskContextSchema = z.object({
  files: z.array(z.string()).default([]),
  folders: z.array(z.string()).default([]),
  gitRef: z.string().optional(),
  images: z.array(z.string()).optional(),
});

export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed']);

export const TaskTypeSchema = z.enum(['plan', 'phases', 'review', 'epic']);

export const VerificationCategorySchema = z.enum(['critical', 'major', 'minor', 'outdated']);

export const VerificationCommentStatusSchema = z.enum(['open', 'fixed', 'ignored']);

export const VerificationCommentSchema = z.object({
  id: z.string(),
  category: VerificationCategorySchema,
  file: z.string().optional(),
  line: z.number().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  status: VerificationCommentStatusSchema,
});

export const VerificationSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  timestamp: z.string(),
  comments: z.array(VerificationCommentSchema),
  summary: z.string(),
});

export const PlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  files: z.array(z.string()),
  symbols: z.array(z.string()).optional(),
  codeSnippet: z.string().optional(),
});

export const PlanIterationSchema = z.object({
  id: z.string(),
  note: z.string(),
  createdAt: z.string(),
});

export const PlanSchema = z.object({
  id: z.string(),
  steps: z.array(PlanStepSchema),
  mermaidDiagram: z.string().optional(),
  rationale: z.string(),
  iterations: z.array(PlanIterationSchema),
});

// ─── Review Schemas ────────────────────────────────────────────────────────

export const ReviewCategorySchema = z.enum(['bug', 'performance', 'security', 'clarity']);

export const ReviewSeveritySchema = z.enum(['critical', 'major', 'minor']);

export const ReviewScopeSchema = z.enum(['uncommitted', 'branch', 'files', 'all']);

export const ReviewCommentSchema = z.object({
  id: z.string(),
  category: ReviewCategorySchema,
  severity: ReviewSeveritySchema,
  file: z.string().optional(),
  line: z.number().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
});

export const ReviewSummarySchema = z.object({
  totalComments: z.number(),
  byCategory: z.record(ReviewCategorySchema, z.number()),
  bySeverity: z.record(ReviewSeveritySchema, z.number()),
  overallAssessment: z.string(),
  keyFindings: z.array(z.string()),
});

export const ReviewSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  query: z.string(),
  scope: ReviewScopeSchema,
  files: z.array(z.string()),
  comments: z.array(ReviewCommentSchema),
  summary: ReviewSummarySchema,
  timestamp: z.string(),
});
