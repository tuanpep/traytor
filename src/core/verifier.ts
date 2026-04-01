import fs from 'node:fs';
import ora from 'ora';
import { getLogger } from '../utils/logger.js';
import { FileAnalyzer, type Codebase } from './file-analyzer.js';
import { LLMService } from '../integrations/llm/llm-service.js';
import { TemplateEngine, type VerificationPromptData } from '../services/template-engine.js';
import { VerificationError } from '../utils/errors.js';
import type { Task } from '../models/task.js';
import type { Plan } from '../models/plan.js';
import type {
  Verification,
  VerificationComment,
  VerificationCategory,
} from '../models/verification.js';
import { createVerificationId, createVerificationCommentId } from '../models/verification.js';
import type { StreamCallback } from '../integrations/llm/types.js';

// ─── Verification Options ───────────────────────────────────────────────────

export interface VerificationOptions {
  /** Maximum number of retries on LLM failure */
  maxRetries?: number;
  /** Working directory to analyze (default: process.cwd()) */
  workingDir?: string;
  /** Verification mode: fresh (full analysis) or reverify (focus on open comments) */
  mode?: 'fresh' | 'reverify';
  /** Severity levels to include in verification results */
  severityFilter?: ('critical' | 'major' | 'minor')[];
}

// ─── File Comparison Result ─────────────────────────────────────────────────

interface FileComparison {
  present: string[];
  missing: string[];
  created: string[];
}

// ─── Verifier ───────────────────────────────────────────────────────────────

export class Verifier {
  private logger = getLogger();
  private templateEngine: TemplateEngine;

  constructor(
    private readonly llmService: LLMService,
    private readonly workingDir: string = process.cwd()
  ) {
    this.templateEngine = new TemplateEngine();
  }

  /**
   * Verify a task's implementation against its plan.
   */
  async verify(task: Task, options: VerificationOptions = {}): Promise<Verification> {
    if (!task.plan) {
      throw new VerificationError(`Task "${task.id}" has no plan to verify against`, {
        taskId: task.id,
      });
    }

    this.logger.info(
      `Verifying task ${task.id} against plan ${task.plan.id} (mode: ${options.mode || 'fresh'})`
    );

    try {
      // 1. Analyze current codebase
      const codebase = await this.analyzeCodebase();

      // 2. Compare implementation against plan
      const steps = task.plan.steps ?? [];
      const fileComparison = this.compareFiles(task.plan, codebase);
      const codeChanges = this.gatherCodeChanges(task.plan, codebase);

      if (fileComparison.missing.length === 0 && fileComparison.present.length === 0 && fileComparison.created.length === 0) {
        this.logger.warn('File comparison returned empty results, continuing with empty code changes');
      }

      // 3. Build verification prompt
      const verificationData: VerificationPromptData = {
        planId: task.plan.id,
        query: task.query,
        steps: steps.map((step) => ({
          title: step.title,
          description: step.description,
          files: step.files,
        })),
        codeChanges,
      };

      // 4. Handle re-verify mode
      if (options.mode === 'reverify' && task.verification) {
        const openComments = task.verification.comments.filter((c) => c.status === 'open');
        if (openComments.length > 0) {
          verificationData.previousComments = openComments.map((c) => ({
            id: c.id,
            status: c.status,
            file: c.file,
            category: c.category,
            message: c.message,
            suggestion: c.suggestion,
          }));
          this.logger.info(`Re-verifying with ${openComments.length} open comments`);
        }
      }

      const prompt = this.templateEngine.renderVerificationTemplate(verificationData);

      // 5. Call LLM for verification analysis
      const maxRetries = options.maxRetries ?? 3;
      const llmResponse = await this.callLLMWithRetry(prompt, maxRetries);

      // 6. Parse verification comments
      const comments = this.parseVerificationResponse(llmResponse.content);

      // 7. Build summary
      const summary = this.buildSummary(comments, fileComparison);

      return {
        id: createVerificationId(),
        taskId: task.id,
        timestamp: new Date().toISOString(),
        comments,
        summary,
      };
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      throw new VerificationError(
        `Unexpected error during verification: ${error instanceof Error ? error.message : String(error)}`,
        { taskId: task.id, originalError: error }
      );
    }
  }

  /**
   * Verify with streaming output for real-time feedback.
   */
  async verifyStream(
    task: Task,
    options: VerificationOptions & { onChunk?: StreamCallback } = {}
  ): Promise<Verification> {
    if (!task.plan) {
      throw new VerificationError(`Task "${task.id}" has no plan to verify against`, {
        taskId: task.id,
      });
    }

    this.logger.info(`Streaming verification for task ${task.id}`);

    const spinner = ora('Analyzing codebase...').start();
    const codebase = await this.analyzeCodebase();

    spinner.text = 'Comparing implementation against plan...';
    const fileComparison = this.compareFiles(task.plan, codebase);
    const codeChanges = this.gatherCodeChanges(task.plan, codebase);

    const verificationData: VerificationPromptData = {
      planId: task.plan.id,
      query: task.query,
      steps: task.plan.steps.map((step) => ({
        title: step.title,
        description: step.description,
        files: step.files,
      })),
      codeChanges,
    };

    const prompt = this.templateEngine.renderVerificationTemplate(verificationData);

    spinner.text = 'Running LLM verification (streaming)...';

    const maxRetries = options.maxRetries ?? 3;
    const llmResponse = await this.callLLMStreamWithRetry(prompt, maxRetries, options.onChunk);

    spinner.succeed(
      `Verification complete (${llmResponse.usage.inputTokens + llmResponse.usage.outputTokens} tokens)`
    );
    process.stdout.write('\n');

    const comments = this.parseVerificationResponse(llmResponse.content);
    const summary = this.buildSummary(comments, fileComparison);

    return {
      id: createVerificationId(),
      taskId: task.id,
      timestamp: new Date().toISOString(),
      comments,
      summary,
    };
  }

  /**
   * Analyze the current codebase state.
   */
  private async analyzeCodebase(): Promise<Codebase> {
    try {
      const analyzer = new FileAnalyzer(this.workingDir);
      return await analyzer.analyze();
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EACCES') {
        throw new VerificationError(
          `Cannot access working directory: ${this.workingDir}`,
          { workingDir: this.workingDir, originalError: error }
        );
      }
      throw new VerificationError(
        `Failed to analyze codebase: ${error instanceof Error ? error.message : String(error)}`,
        { workingDir: this.workingDir, originalError: error }
      );
    }
  }

  /**
   * Compare planned files against actual codebase files.
   */
  private compareFiles(plan: Plan, codebase: Codebase): FileComparison {
    const plannedFiles = new Set<string>();
    for (const step of plan.steps) {
      for (const file of step.files) {
        plannedFiles.add(file);
      }
    }

    const actualFiles = new Set(codebase.files.map((f) => f.relativePath));

    const present: string[] = [];
    const missing: string[] = [];
    const created: string[] = [];

    for (const plannedFile of plannedFiles) {
      // Check if the file exists in the codebase (match by relative path or basename)
      const found =
        actualFiles.has(plannedFile) ||
        codebase.files.some((f) => f.relativePath.endsWith(plannedFile));

      if (found) {
        present.push(plannedFile);
      } else {
        missing.push(plannedFile);
      }
    }

    // Check for files in codebase that weren't in the plan
    for (const actualFile of actualFiles) {
      const isInPlan =
        plannedFiles.has(actualFile) || [...plannedFiles].some((p) => actualFile.endsWith(p));
      if (!isInPlan) {
        created.push(actualFile);
      }
    }

    return { present, missing, created };
  }

  /**
   * Gather the actual code content for files referenced in the plan.
   */
  private gatherCodeChanges(plan: Plan, codebase: Codebase): string {
    const allPlannedFiles = new Set<string>();
    for (const step of plan.steps) {
      for (const file of step.files) {
        allPlannedFiles.add(file);
      }
    }

    const sections: string[] = [];

    for (const filePath of allPlannedFiles) {
      // Find the matching file in the codebase
      const analyzedFile = codebase.files.find(
        (f) => f.relativePath === filePath || f.relativePath.endsWith(filePath)
      );

      if (analyzedFile) {
        try {
          const content = fs.readFileSync(analyzedFile.path, 'utf-8');
          // Truncate large files
          const truncated =
            content.length > 5000 ? content.slice(0, 5000) + '\n// ... (truncated)' : content;
          sections.push(`--- ${filePath} ---\n${truncated}`);
        } catch {
          sections.push(`--- ${filePath} ---\n// (unable to read file)`);
        }
      } else {
        sections.push(`--- ${filePath} ---\n// (file not found)`);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Call LLM with retry logic.
   */
  private async callLLMWithRetry(prompt: string, maxRetries: number): Promise<{ content: string }> {
    let lastError: Error | null = null;

    const stepOptions = this.llmService.getStepOptions('verification');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`LLM verification attempt ${attempt}/${maxRetries}`);
        const response = await this.llmService.complete(prompt, {
          ...stepOptions,
          maxTokens: stepOptions.maxTokens ?? 4096,
        });
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`LLM verification attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new VerificationError(
      `LLM verification failed after ${maxRetries} attempt${maxRetries > 1 ? 's' : ''}: ${lastError?.message}`,
      { attempts: maxRetries }
    );
  }

  /**
   * Call LLM with streaming and retry logic.
   */
  private async callLLMStreamWithRetry(
    prompt: string,
    maxRetries: number,
    onChunk?: StreamCallback
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`LLM streaming verification attempt ${attempt}/${maxRetries}`);
        const response = await this.llmService.stream(prompt, {
          maxTokens: 4096,
          onChunk: onChunk ?? (() => {}),
        });
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `LLM streaming verification attempt ${attempt} failed: ${lastError.message}`
        );

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new VerificationError(
      `LLM streaming verification failed after ${maxRetries} attempts: ${lastError?.message}`,
      { attempts: maxRetries }
    );
  }

  /**
   * Parse the LLM verification response into structured comments.
   * Tries JSON parsing first, falls back to regex-based parsing.
   */
  parseVerificationResponse(response: string): VerificationComment[] {
    const comments: VerificationComment[] = [];

    // Try JSON parsing first
    const jsonResult = this.tryParseJson(response);
    if (jsonResult) {
      for (const item of jsonResult) {
        comments.push({
          id: createVerificationCommentId(),
          category: this.normalizeCategory(item.category),
          file: item.file,
          line: item.line,
          message: item.message,
          suggestion: item.suggestion,
          status: 'open',
        });
      }
      return comments;
    }

    // Fall back to regex-based parsing
    const issueBlocks = this.extractIssueBlocks(response);

    for (const block of issueBlocks) {
      const comment = this.parseIssueBlock(block);
      if (comment) {
        comments.push(comment);
      }
    }

    return comments;
  }

  /**
   * Try to parse JSON from the LLM response.
   * Handles both raw JSON and JSON wrapped in markdown code blocks.
   */
  private tryParseJson(response: string): Array<{
    file?: string;
    line?: number;
    category: string;
    message: string;
    suggestion?: string;
  }> | null {
    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : response.trim();

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.comments && Array.isArray(parsed.comments)) {
        return parsed.comments;
      }
    } catch {
      // Not valid JSON, fall back to regex
    }

    // Try to find JSON object in the response
    const jsonMatch = response.match(/\{[\s\S]*"comments"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.comments && Array.isArray(parsed.comments)) {
          return parsed.comments;
        }
      } catch {
        // Not valid JSON
      }
    }

    return null;
  }

  /**
   * Normalize category string to VerificationCategory.
   */
  private normalizeCategory(category?: string): VerificationCategory {
    if (!category) return 'minor';
    const normalized = category.toLowerCase();
    switch (normalized) {
      case 'critical':
      case 'error':
      case 'blocker':
        return 'critical';
      case 'major':
      case 'warning':
      case 'high':
        return 'major';
      case 'minor':
      case 'suggestion':
      case 'info':
      case 'low':
        return 'minor';
      case 'outdated':
        return 'outdated';
      default:
        return 'minor';
    }
  }

  /**
   * Extract individual issue blocks from the verification response.
   */
  private extractIssueBlocks(response: string): string[] {
    const blocks: string[] = [];

    // Try to find issue blocks with various patterns
    // Pattern 1: Numbered issues (1., 2., etc.) or bullet points with File: and Severity:
    const lines = response.split('\n');
    let currentBlock: string[] = [];
    let inBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Start of a new issue block (skip checklist items like - [x] or - [ ])
      if (
        trimmed.match(/^\d+\.\s/) ||
        (trimmed.match(/^[-*]\s/) &&
          !trimmed.match(/^[-*]\s*\[[ x]\]/i) &&
          !trimmed.match(/^[-*]\s*\*+/)) ||
        trimmed.match(/^###?\s+Issue/i)
      ) {
        if (inBlock && currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
        }
        currentBlock = [trimmed];
        inBlock = true;
      } else if (inBlock) {
        // Check if we've hit a section boundary
        if (trimmed.match(/^#{1,4}\s/) || trimmed.match(/^---/) || trimmed === '') {
          if (
            currentBlock.length > 0 &&
            currentBlock.some((l) => l.includes('Severity') || l.includes('Description'))
          ) {
            blocks.push(currentBlock.join('\n'));
          }
          currentBlock = [];
          inBlock = false;
        } else {
          currentBlock.push(trimmed);
        }
      }
    }

    // Don't forget the last block
    if (
      currentBlock.length > 0 &&
      currentBlock.some((l) => l.includes('Severity') || l.includes('Description'))
    ) {
      blocks.push(currentBlock.join('\n'));
    }

    return blocks;
  }

  /**
   * Parse a single issue block into a VerificationComment.
   */
  private parseIssueBlock(block: string): VerificationComment | null {
    const fileMatch =
      block.match(/\*\*File:\*\*\s*`([^`]+)`/i) ||
      block.match(/File:\s*`([^`]+)`/i) ||
      block.match(/file:\s*(\S+\.\w+)/i);
    const severityMatch =
      block.match(/\*\*Severity:\*\*\s*(\w+)/i) || block.match(/Severity:\s*(\w+)/i);
    const descriptionMatch =
      block.match(/\*\*Description:\*\*\s*(.+?)(?=\n\*\*|\n\n|$)/is) ||
      block.match(/Description:\s*(.+?)(?=\n\*|\n\n|$)/is);

    const suggestionMatch =
      block.match(/\*\*Suggestion:\*\*\s*(.+?)(?=\n\*\*|\n\n|$)/is) ||
      block.match(/Suggestion:\s*(.+?)(?=\n\*|\n\n|$)/is);

    const lineMatch = block.match(/line\s+(\d+)/i);

    // If no severity/description found, try to extract from the text more loosely
    const severity = this.mapSeverity(severityMatch?.[1]);
    const description = descriptionMatch?.[1]?.trim() || block.slice(0, 200).trim();
    const file = fileMatch?.[1];
    const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
    const suggestion = suggestionMatch?.[1]?.trim();

    if (!description || description.length < 10) {
      return null;
    }

    return {
      id: createVerificationCommentId(),
      category: severity,
      file,
      line,
      message: description,
      suggestion,
      status: 'open',
    };
  }

  /**
   * Map severity strings from LLM response to VerificationCategory.
   */
  private mapSeverity(severity?: string): VerificationCategory {
    if (!severity) return 'minor';

    const normalized = severity.toLowerCase();
    switch (normalized) {
      case 'error':
      case 'critical':
        return 'critical';
      case 'warning':
      case 'major':
        return 'major';
      case 'suggestion':
      case 'info':
        return 'minor';
      case 'outdated':
        return 'outdated';
      default:
        return 'minor';
    }
  }

  /**
   * Build a human-readable summary of the verification.
   */
  private buildSummary(comments: VerificationComment[], fileComparison: FileComparison): string {
    const categoryCounts: Record<VerificationCategory, number> = {
      critical: 0,
      major: 0,
      minor: 0,
      outdated: 0,
    };

    for (const comment of comments) {
      categoryCounts[comment.category]++;
    }

    const parts: string[] = [];

    // Category counts
    parts.push(`Verification complete. Found ${comments.length} issue(s):`);
    if (categoryCounts.critical > 0) parts.push(`  - Critical: ${categoryCounts.critical}`);
    if (categoryCounts.major > 0) parts.push(`  - Major: ${categoryCounts.major}`);
    if (categoryCounts.minor > 0) parts.push(`  - Minor: ${categoryCounts.minor}`);
    if (categoryCounts.outdated > 0) parts.push(`  - Outdated: ${categoryCounts.outdated}`);

    // File comparison
    if (fileComparison.missing.length > 0) {
      parts.push(
        `\nMissing files (${fileComparison.missing.length}): ${fileComparison.missing.join(', ')}`
      );
    }
    if (fileComparison.created.length > 0) {
      parts.push(
        `\nUnexpected files (${fileComparison.created.length}): ${fileComparison.created.join(', ')}`
      );
    }
    if (fileComparison.present.length > 0) {
      parts.push(
        `\nImplemented files (${fileComparison.present.length}): ${fileComparison.present.join(', ')}`
      );
    }

    // Overall assessment
    if (categoryCounts.critical === 0 && categoryCounts.major === 0) {
      parts.push('\nOverall: APPROVED');
    } else {
      parts.push('\nOverall: NEEDS_CHANGES');
    }

    return parts.join('\n');
  }
}
