import chalk from 'chalk';
import { getLogger } from '../utils/logger.js';
import { safeFilterArray } from '../utils/safe-access.js';
import {
  buildCommentBlock,
  buildInstructionsList,
  buildContextBlock,
} from '../utils/prompt-builder.js';
import { validateFilePath } from '../utils/validation.js';
import type { Verification, VerificationComment } from '../models/verification.js';
import type { Task } from '../models/task.js';
import type { AgentService } from './agent-service.js';
import type { Verifier } from '../core/verifier.js';

export interface FixCommentResult {
  commentId: string;
  success: boolean;
  message: string;
  verified?: boolean;
}

export interface FixAllResult {
  total: number;
  fixed: number;
  failed: number;
  results: FixCommentResult[];
}

export class VerificationFixService {
  private logger = getLogger();
  private readonly safeWorkingDir: string;
  private readonly verifier?: Verifier;

  constructor(
    private readonly agentService: AgentService,
    workingDir: string,
    verifier?: Verifier
  ) {
    this.safeWorkingDir = validateFilePath(workingDir);
    this.verifier = verifier;
  }

  generateFixPrompt(
    comments: VerificationComment[],
    task: Task,
    options?: { includePlan?: boolean; onlyBlocking?: boolean; severityFilter?: string[] }
  ): string {
    const safeComments = safeFilterArray(comments);
    const blockingCategories = options?.severityFilter ?? ['critical', 'major'];
    const filteredComments = options?.onlyBlocking
      ? safeComments.filter((c) => blockingCategories.includes(c.category))
      : safeComments;

    if (filteredComments.length === 0) {
      return 'No comments to fix.';
    }

    let prompt = `# Verification Fix Request\n\n`;
    prompt += `## Task\n${task.query}\n\n`;

    if (options?.includePlan && task.plan) {
      prompt += `## Original Plan\n`;
      for (const step of task.plan.steps) {
        prompt += `- ${step.title}: ${step.description}\n`;
        if (step.files.length > 0) {
          prompt += `  Files: ${step.files.join(', ')}\n`;
        }
      }
      prompt += '\n';
    }

    prompt += `## Verification Comments (${filteredComments.length})\n\n`;
    prompt += `Please address the following issues found during verification:\n\n`;

    for (let i = 0; i < filteredComments.length; i++) {
      const comment = filteredComments[i]!;
      prompt += buildCommentBlock(
        i + 1,
        comment.category,
        comment.category,
        comment.file,
        comment.line,
        comment.message,
        comment.suggestion
      );
      prompt += '\n';
    }

    prompt += `## Instructions\n\n`;
    prompt += buildInstructionsList([
      'Address each comment in order',
      'For each issue, make the necessary code changes',
      'Focus on the most severe issues first (critical, then major)',
      'After making changes, verify that the fix addresses the original concern',
      'Do NOT introduce new issues while fixing existing ones',
    ]);
    prompt += '\n\n';
    prompt += `## Context\n\n`;
    prompt += buildContextBlock(this.safeWorkingDir, {
      'Git status': 'will be checked after fixes are complete',
    });

    return prompt;
  }

  async fixComment(
    comment: VerificationComment,
    task: Task,
    agentName?: string,
    verifier?: Verifier
  ): Promise<FixCommentResult> {
    if (!comment) {
      return {
        commentId: 'unknown',
        success: false,
        message: 'Comment is null or undefined',
      };
    }

    this.logger.info(`Fixing comment ${comment.id}`);

    try {
      const fixPrompt = this.generateFixPrompt([comment], task, {
        includePlan: !!task.plan,
        onlyBlocking: false,
      });

      const fixTask: Task = {
        id: `fix_${comment.id}`,
        type: 'plan',
        query: fixPrompt,
        status: 'in_progress',
        context: task.context,
        plan: task.plan,
        executions: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await this.agentService.execute(fixTask, {
        cwd: this.safeWorkingDir,
        agentName,
      });

      if (!result.success) {
        return {
          commentId: comment.id,
          success: false,
          message: result.stderr || 'Agent execution failed',
        };
      }

      if (verifier) {
        this.logger.info(`Re-verifying comment ${comment.id} after fix...`);
        try {
          const verifyResult = await verifier.verify(task, {
            workingDir: this.safeWorkingDir,
            mode: 'reverify',
          });

          const stillOpen = verifyResult.comments.find(
            (c) => c.id === comment.id && c.status === 'open'
          );

          if (stillOpen) {
            return {
              commentId: comment.id,
              success: false,
              verified: false,
              message: 'Comment still open after fix - fix may not have addressed the issue',
            };
          }

          return {
            commentId: comment.id,
            success: true,
            verified: true,
            message: 'Comment fixed and verified',
          };
        } catch (verifyError) {
          this.logger.warn(`Re-verification failed: ${verifyError}, assuming fix succeeded`);
          return {
            commentId: comment.id,
            success: true,
            verified: false,
            message: 'Fix applied but verification inconclusive',
          };
        }
      }

      return {
        commentId: comment.id,
        success: true,
        verified: false,
        message: 'Comment fixed successfully (verification skipped)',
      };
    } catch (error) {
      this.logger.error(`Failed to fix comment ${comment.id}: ${error}`);
      return {
        commentId: comment.id,
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async fixSelectedComments(
    commentIds: string[],
    verification: Verification,
    task: Task,
    agentName?: string
  ): Promise<FixAllResult> {
    const selectedComments = verification.comments.filter((c) => commentIds.includes(c.id));

    if (selectedComments.length === 0) {
      return {
        total: 0,
        fixed: 0,
        failed: 0,
        results: [],
      };
    }

    this.logger.info(`Fixing ${selectedComments.length} selected comments`);

    const results: FixCommentResult[] = [];
    let fixed = 0;
    let failed = 0;

    console.log(chalk.bold(`\n🔧 Fixing ${selectedComments.length} selected comments\n`));

    for (const comment of selectedComments) {
      console.log(chalk.dim(`  Processing: ${comment.message.substring(0, 50)}...`));
      const result = await this.fixComment(comment, task, agentName, this.verifier);
      results.push(result);

      if (result.success) {
        fixed++;
        console.log(chalk.green(`    ✓ ${comment.id}`));
      } else {
        failed++;
        console.log(chalk.red(`    ✗ ${comment.id}: ${result.message}`));
      }
    }

    return {
      total: selectedComments.length,
      fixed,
      failed,
      results,
    };
  }

  async fixAllComments(
    verification: Verification,
    task: Task,
    options?: {
      agentName?: string;
      severityFilter?: string[];
      dryRun?: boolean;
    }
  ): Promise<FixAllResult> {
    const blockingCategories = options?.severityFilter ?? ['critical', 'major'];
    const commentsToFix = verification.comments.filter(
      (c) =>
        c.status !== 'fixed' && c.status !== 'ignored' && blockingCategories.includes(c.category)
    );

    if (commentsToFix.length === 0) {
      console.log(chalk.green('\n✓ No comments to fix (all issues resolved or filtered out)\n'));
      return {
        total: 0,
        fixed: 0,
        failed: 0,
        results: [],
      };
    }

    console.log(chalk.bold(`\n🔧 Fixing all ${commentsToFix.length} blocking comments\n`));
    console.log(chalk.dim(`Severity filter: ${blockingCategories.join(', ')}\n`));

    if (options?.dryRun) {
      console.log(chalk.yellow('DRY RUN - No changes will be made\n'));
      return {
        total: commentsToFix.length,
        fixed: 0,
        failed: 0,
        results: commentsToFix.map((c) => ({
          commentId: c.id,
          success: false,
          message: 'Dry run - would fix',
        })),
      };
    }

    const results: FixCommentResult[] = [];
    let fixed = 0;
    let failed = 0;

    for (const comment of commentsToFix) {
      console.log(chalk.dim(`  Processing: ${comment.message.substring(0, 50)}...`));
      const result = await this.fixComment(comment, task, options?.agentName, this.verifier);
      results.push(result);

      if (result.success) {
        fixed++;
        console.log(chalk.green(`    ✓ ${comment.id}`));
      } else {
        failed++;
        console.log(chalk.red(`    ✗ ${comment.id}: ${result.message}`));
      }
    }

    return {
      total: commentsToFix.length,
      fixed,
      failed,
      results,
    };
  }

  async fixWithBatch(
    verification: Verification,
    task: Task,
    options?: {
      agentName?: string;
      severityFilter?: string[];
      batchSize?: number;
    }
  ): Promise<FixAllResult> {
    const batchSize = options?.batchSize ?? 3;
    const blockingCategories = options?.severityFilter ?? ['critical', 'major'];
    const commentsToFix = verification.comments.filter(
      (c) =>
        c.status !== 'fixed' && c.status !== 'ignored' && blockingCategories.includes(c.category)
    );

    if (commentsToFix.length === 0) {
      return {
        total: 0,
        fixed: 0,
        failed: 0,
        results: [],
      };
    }

    this.logger.info(`Batch fixing ${commentsToFix.length} comments in batches of ${batchSize}`);

    const results: FixCommentResult[] = [];
    let fixed = 0;
    let failed = 0;

    console.log(chalk.bold(`\n🔧 Batch fixing ${commentsToFix.length} comments\n`));

    for (let i = 0; i < commentsToFix.length; i += batchSize) {
      const batch = commentsToFix.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(commentsToFix.length / batchSize);

      console.log(chalk.cyan(`\nBatch ${batchNum}/${totalBatches}:\n`));

      const batchPrompt = this.generateFixPrompt(batch, task, {
        includePlan: !!task.plan,
        onlyBlocking: false,
      });

      const batchTask: Task = {
        id: `batch_fix_${batchNum}`,
        type: 'plan',
        query: batchPrompt,
        status: 'in_progress',
        context: task.context,
        plan: task.plan,
        executions: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        const result = await this.agentService.execute(batchTask, {
          cwd: this.safeWorkingDir,
          agentName: options?.agentName,
        });

        for (const comment of batch) {
          const fixResult: FixCommentResult = {
            commentId: comment.id,
            success: result.success,
            message: result.success ? 'Batch fix completed' : result.stderr || 'Failed',
          };
          results.push(fixResult);

          if (result.success) {
            fixed++;
            console.log(chalk.green(`  ✓ ${comment.id}`));
          } else {
            failed++;
            console.log(chalk.red(`  ✗ ${comment.id}`));
          }
        }
      } catch (error) {
        for (const comment of batch) {
          const fixResult: FixCommentResult = {
            commentId: comment.id,
            success: false,
            message: error instanceof Error ? error.message : String(error),
          };
          results.push(fixResult);
          failed++;
          console.log(
            chalk.red(
              `  ✗ ${comment.id}: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }
    }

    return {
      total: commentsToFix.length,
      fixed,
      failed,
      results,
    };
  }
}
