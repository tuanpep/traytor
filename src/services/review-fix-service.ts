import chalk from 'chalk';
import { getLogger } from '../utils/logger.js';
import type { Review } from '../models/review.js';
import type { Task } from '../models/task.js';
import type { AgentService } from './agent-service.js';

export interface ReviewFixResult {
  commentId: string;
  success: boolean;
  message: string;
}

export interface ReviewFixAllResult {
  total: number;
  fixed: number;
  failed: number;
  results: ReviewFixResult[];
}

export class ReviewFixService {
  private logger = getLogger();

  constructor(
    private readonly agentService: AgentService,
    private readonly workingDir: string
  ) {}

  generateFixPrompt(
    review: Review,
    commentIds?: string[],
    options?: { onlyBlocking?: boolean; severityFilter?: string[] }
  ): string {
    const severityOrder = ['critical', 'major', 'minor'];
    let filteredComments = [...(review.comments ?? [])];

    if (commentIds && commentIds.length > 0) {
      filteredComments = filteredComments.filter((c) => commentIds.includes(c.id));
    }

    if (options?.severityFilter && options.severityFilter.length > 0) {
      filteredComments = filteredComments.filter((c) =>
        options.severityFilter!.includes(c.severity)
      );
    }

    if (filteredComments.length === 0) {
      return 'No comments to fix.';
    }

    filteredComments.sort((a, b) => {
      const aIdx = severityOrder.indexOf(a.severity);
      const bIdx = severityOrder.indexOf(b.severity);
      return aIdx - bIdx;
    });

    let prompt = `# Code Review Fix Request\n\n`;
    prompt += `## Review Summary\n`;
    prompt += `${review.summary || 'Please address the following review comments.'}\n\n`;

    prompt += `## Comments (${filteredComments.length})\n\n`;
    prompt += `Please address the following issues found during code review:\n\n`;

    for (let i = 0; i < filteredComments.length; i++) {
      const comment = filteredComments[i];
      const prefix = `[${i + 1}]`;
      const severityTag = `[${comment.severity.toUpperCase()}]`;
      const categoryTag = `[${comment.category.toUpperCase()}]`;

      prompt += `${prefix} ${severityTag} ${categoryTag} `;
      if (comment.file) {
        prompt += `${comment.file}`;
        if (comment.line) {
          prompt += `:${comment.line}`;
        }
        prompt += '\n';
      }
      prompt += `   ${comment.message}\n`;
      if (comment.suggestion) {
        prompt += `   Suggested fix: ${comment.suggestion}\n`;
      }
      prompt += '\n';
    }

    prompt += `## Instructions\n\n`;
    prompt += `1. Address each comment in order of severity (critical → major → minor)\n`;
    prompt += `2. For each issue, make the necessary code changes\n`;
    prompt += `3. Focus on the most severe issues first\n`;
    prompt += `4. After making changes, verify that the fix addresses the original concern\n`;
    prompt += `5. Do NOT introduce new issues while fixing existing ones\n\n`;
    prompt += `## Context\n\n`;
    prompt += `Working directory: ${this.workingDir}\n`;

    return prompt;
  }

  async fixComments(
    review: Review,
    task: Task,
    options?: {
      commentIds?: string[];
      agentName?: string;
      severityFilter?: string[];
      onlyBlocking?: boolean;
    }
  ): Promise<ReviewFixAllResult> {
    const severityOrder = ['critical', 'major', 'minor'];
    let commentsToFix = [...(review.comments ?? [])];

    if (options?.commentIds && options.commentIds.length > 0) {
      commentsToFix = commentsToFix.filter((c) => options.commentIds!.includes(c.id));
    }

    if (options?.severityFilter && options.severityFilter.length > 0) {
      commentsToFix = commentsToFix.filter((c) => options.severityFilter!.includes(c.severity));
    }

    if (commentsToFix.length === 0) {
      return { total: 0, fixed: 0, failed: 0, results: [] };
    }

    commentsToFix.sort((a, b) => {
      const aIdx = severityOrder.indexOf(a.severity);
      const bIdx = severityOrder.indexOf(b.severity);
      return aIdx - bIdx;
    });

    this.logger.info(`Fixing ${commentsToFix.length} review comments`);

    const fixPrompt = this.generateFixPrompt(review, options?.commentIds, {
      onlyBlocking: options?.onlyBlocking,
      severityFilter: options?.severityFilter,
    });

    const fixTask: Task = {
      id: `review_fix_${review.id}`,
      type: 'review',
      query: fixPrompt,
      status: 'in_progress',
      context: task.context,
      executions: [],
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log(chalk.bold(`\n🔧 Fixing ${commentsToFix.length} review comments\n`));

    try {
      const result = await this.agentService.execute(fixTask, {
        cwd: this.workingDir,
        agentName: options?.agentName,
      });

      const results: ReviewFixResult[] = commentsToFix.map((c) => ({
        commentId: c.id,
        success: result.success,
        message: result.success ? 'Agent executed' : result.stderr || 'Agent failed',
      }));

      return {
        total: commentsToFix.length,
        fixed: result.success ? commentsToFix.length : 0,
        failed: result.success ? 0 : commentsToFix.length,
        results,
      };
    } catch (error) {
      this.logger.error(`Review fix failed: ${error}`);
      const results: ReviewFixResult[] = commentsToFix.map((c) => ({
        commentId: c.id,
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }));

      return {
        total: commentsToFix.length,
        fixed: 0,
        failed: commentsToFix.length,
        results,
      };
    }
  }
}
