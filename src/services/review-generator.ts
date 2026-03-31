import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';
import { FileAnalyzer, type AnalyzedFile, type SupportedLanguage } from '../core/file-analyzer.js';
import type { SymbolReference } from '../models/symbol-reference.js';
import { ContextManager } from '../core/context-manager.js';
import { LLMService } from '../integrations/llm/llm-service.js';
import { TemplateEngine } from './template-engine.js';
import { VerificationError } from '../utils/errors.js';
import type {
  Review,
  ReviewComment,
  ReviewCategory,
  ReviewSeverity,
  ReviewScope,
  ReviewSummary,
} from '../models/review.js';
import { createReviewId, createReviewCommentId } from '../models/review.js';

// ─── Review Options ────────────────────────────────────────────────────────

export interface ReviewOptions {
  /** Git ref to compare against (e.g., 'main', 'HEAD~3') */
  against?: string;
  /** Specific files to review */
  files?: string[];
  /** Working directory */
  cwd?: string;
  /** Maximum retries on LLM failure */
  maxRetries?: number;
}

// ─── Review Prompt Data ────────────────────────────────────────────────────

export interface ReviewPromptData {
  query: string;
  scopeDescription: string;
  projectDescription: string;
  agentsMd: string | null;
  files: {
    relativePath: string;
    language: string;
    lineCount: number;
    symbols: { name: string; kind: string }[];
    content: string;
  }[];
}

export interface ReviewFixPromptData {
  query: string;
  reviewComments: ReviewComment[];
  projectContext: string;
  agentsMd: string | null;
}

// ─── ReviewGenerator ───────────────────────────────────────────────────────

export class ReviewGenerator {
  private logger = getLogger();
  private templateEngine: TemplateEngine;

  constructor(
    private readonly llmService: LLMService,
    private readonly workingDir: string
  ) {
    this.templateEngine = new TemplateEngine();
  }

  /**
   * Generate a code review for the given query and options.
   */
  async generate(query: string, options: ReviewOptions = {}): Promise<Review> {
    const cwd = options.cwd || this.workingDir;
    this.logger.info(`Generating review for: "${query}" in ${cwd}`);

    // 1. Determine scope and gather files
    const { scope, files } = await this.resolveScope(cwd, options);

    // 2. Analyze the files
    const analyzedFiles = this.analyzeFiles(files, cwd);

    // 3. Gather project context
    const contextManager = new ContextManager();
    const context = await contextManager.gather(cwd);

    // 4. Build prompt data
    const promptData = this.buildPromptData(query, scope, context, analyzedFiles, options);

    // 5. Render the review template
    const prompt = this.templateEngine.render(
      'review',
      promptData as unknown as Record<string, unknown>
    );

    this.logger.debug('Review prompt built, sending to LLM...');

    // 6. Call LLM
    const llmResponse = await this.callLLMWithRetry(prompt, options.maxRetries ?? 3);

    this.logger.info('LLM response received, parsing review...');

    // 7. Parse response into Review
    const comments = this.parseReviewResponse(llmResponse.content);
    const summary = this.buildSummary(comments);

    return {
      id: createReviewId(),
      taskId: '', // Will be set by TaskService
      query,
      scope,
      files: analyzedFiles.map((f) => f.relativePath),
      comments,
      summary,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Resolve which files to review based on scope options.
   */
  private async resolveScope(
    cwd: string,
    options: ReviewOptions
  ): Promise<{ scope: ReviewScope; files: string[] }> {
    const analyzer = new FileAnalyzer(cwd);

    // If specific files are provided, use those
    if (options.files && options.files.length > 0) {
      const absoluteFiles = options.files.map((f) =>
        path.isAbsolute(f) ? f : path.resolve(cwd, f)
      );
      return { scope: 'files', files: absoluteFiles };
    }

    // If a git ref is provided, try to get changed files via git diff
    if (options.against) {
      const changedFiles = await this.getGitChangedFiles(cwd, options.against);
      if (changedFiles.length > 0) {
        return { scope: 'branch', files: changedFiles };
      }
      this.logger.warn(
        `No changed files found against "${options.against}", falling back to all files`
      );
    }

    // Default: analyze all project files (uncommitted scope means working tree)
    const codebase = await analyzer.analyze();
    return {
      scope: 'all',
      files: codebase.files.map((f) => f.path),
    };
  }

  /**
   * Get files changed between HEAD and a git ref using git diff.
   */
  private async getGitChangedFiles(cwd: string, ref: string): Promise<string[]> {
    try {
      const { execSync } = await import('node:child_process');
      // Get list of changed files (added, modified, renamed)
      const output = execSync(
        `git diff --name-only --diff-filter=ACMR HEAD...${ref} 2>/dev/null || git diff --name-only --diff-filter=ACMR ${ref}`,
        { cwd, encoding: 'utf-8', timeout: 10000 }
      ).trim();

      if (!output) return [];

      const files = output.split('\n').filter((f) => f.trim());
      return files.map((f) => path.resolve(cwd, f));
    } catch {
      this.logger.warn(`Failed to get git diff against "${ref}"`);
      return [];
    }
  }

  /**
   * Analyze a set of file paths into AnalyzedFile objects.
   */
  private analyzeFiles(filePaths: string[], cwd: string): AnalyzedFile[] {
    const extLanguageMap: Record<string, SupportedLanguage> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.vue': 'vue',
      '.svelte': 'svelte',
    };

    const analyzed: AnalyzedFile[] = [];

    for (const filePath of filePaths) {
      try {
        const ext = path.extname(filePath);
        const language = extLanguageMap[ext] as SupportedLanguage | undefined;
        if (!language) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(cwd, filePath);
        const lineCount = content.split('\n').length;

        // Extract basic symbols using regex patterns
        const symbols: SymbolReference[] = this.extractBasicSymbols(content, relativePath);

        analyzed.push({
          path: filePath,
          relativePath,
          language,
          size: content.length,
          lineCount,
          symbols,
          imports: [],
          exports: [],
        });
      } catch (error) {
        this.logger.warn(`Failed to read file ${filePath}: ${error}`);
      }
    }

    return analyzed;
  }

  /**
   * Extract basic symbols from file content using regex.
   */
  private extractBasicSymbols(content: string, relativePath: string): SymbolReference[] {
    const symbols: SymbolReference[] = [];
    const patterns: { kind: SymbolReference['kind']; regex: RegExp }[] = [
      { kind: 'function', regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g },
      { kind: 'function', regex: /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g },
      { kind: 'class', regex: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g },
      { kind: 'interface', regex: /(?:export\s+)?interface\s+(\w+)/g },
      { kind: 'type', regex: /(?:export\s+)?type\s+(\w+)\s*(?:<|=\s)/g },
    ];

    const lines = content.split('\n');

    for (const { kind, regex } of patterns) {
      const regexCopy = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regexCopy.exec(content)) !== null) {
        const name = match[1];
        if (!name) continue;

        // Find line number
        const position = match.index;
        let currentPos = 0;
        let lineNum = 1;
        for (const line of lines) {
          currentPos += line.length + 1;
          if (currentPos > position) break;
          lineNum++;
        }

        if (!symbols.some((s) => s.name === name && s.kind === kind)) {
          symbols.push({ name, kind, filePath: relativePath, line: lineNum });
        }
      }
    }

    return symbols;
  }

  /**
   * Build the prompt data for the review template.
   */
  private buildPromptData(
    query: string,
    scope: ReviewScope,
    context: Awaited<ReturnType<ContextManager['gather']>>,
    analyzedFiles: AnalyzedFile[],
    options: ReviewOptions
  ): ReviewPromptData {
    const scopeDescriptions: Record<ReviewScope, string> = {
      uncommitted: 'Reviewing uncommitted changes in the working tree.',
      branch: `Reviewing changes against "${options.against}" branch.`,
      files: `Reviewing ${analyzedFiles.length} specified file(s).`,
      all: `Reviewing all ${analyzedFiles.length} source files in the project.`,
    };

    const projectParts: string[] = [`Working directory: ${context.workingDirectory}`];
    const langSummary = Object.entries(context.summary.languages)
      .map(([lang, info]) => `${lang} (${info.files} files, ${info.lines} lines)`)
      .join(', ');
    if (langSummary) projectParts.push(`Languages: ${langSummary}`);
    projectParts.push(
      `Total files: ${context.summary.totalFiles}, Total lines: ${context.summary.totalLines}`
    );
    if (context.packageJson) {
      const pkg = context.packageJson;
      if (pkg.name) projectParts.push(`Package: ${pkg.name}`);
      if (pkg.description) projectParts.push(`Description: ${pkg.description}`);
    }

    const filesWithContent = analyzedFiles.map((file) => {
      let content = '';
      try {
        const raw = fs.readFileSync(file.path, 'utf-8');
        // Truncate large files to keep prompt manageable (up to ~15k chars)
        content = raw.length > 15000 ? raw.slice(0, 15000) + '\n// ... (truncated)' : raw;
      } catch {
        content = '// (unable to read file)';
      }

      return {
        relativePath: file.relativePath,
        language: file.language,
        lineCount: file.lineCount,
        symbols: file.symbols.map((s) => ({ name: s.name, kind: s.kind })),
        content,
      };
    });

    return {
      query,
      scopeDescription: scopeDescriptions[scope],
      projectDescription: projectParts.join('\n'),
      agentsMd: context.agentsMd,
      files: filesWithContent,
    };
  }

  /**
   * Call LLM with retry logic.
   */
  private async callLLMWithRetry(prompt: string, maxRetries: number): Promise<{ content: string }> {
    let lastError: Error | null = null;

    const stepOptions = this.llmService.getStepOptions('review');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`LLM review attempt ${attempt}/${maxRetries}`);
        const response = await this.llmService.complete(prompt, {
          ...stepOptions,
          maxTokens: stepOptions.maxTokens ?? 8192,
        });
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`LLM review attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new VerificationError(
      `Code review failed after ${maxRetries} attempt${maxRetries > 1 ? 's' : ''}: ${lastError?.message}`,
      { attempts: maxRetries }
    );
  }

  /**
   * Parse the LLM review response into structured ReviewComment objects.
   */
  parseReviewResponse(response: string): ReviewComment[] {
    const comments: ReviewComment[] = [];
    const blocks = this.extractFindingBlocks(response);

    for (const block of blocks) {
      const comment = this.parseFindingBlock(block);
      if (comment) {
        comments.push(comment);
      }
    }

    return comments;
  }

  /**
   * Extract individual finding blocks from the review response.
   */
  private extractFindingBlocks(response: string): string[] {
    const blocks: string[] = [];
    const lines = response.split('\n');
    let currentBlock: string[] = [];
    let inBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Start of a new finding block
      if (
        trimmed.match(/^\d+\.\s/) ||
        (trimmed.match(/^[-*]\s/) &&
          !trimmed.match(/^[-*]\s*\[[ x]\]/i) &&
          !trimmed.match(/^[-*]\s*\*+/) &&
          (trimmed.toLowerCase().includes('category') ||
            trimmed.toLowerCase().includes('file') ||
            trimmed.toLowerCase().includes('severity')))
      ) {
        if (inBlock && currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
        }
        currentBlock = [trimmed];
        inBlock = true;
      } else if (inBlock) {
        // Check for section boundary
        if (
          trimmed.match(/^#{1,4}\s+(?!Category|File|Line|Severity|Description|Suggestion)/i) ||
          trimmed === '---'
        ) {
          if (currentBlock.length > 0) {
            blocks.push(currentBlock.join('\n'));
          }
          currentBlock = [];
          inBlock = false;
        } else {
          currentBlock.push(trimmed);
        }
      }
    }

    // Last block
    if (currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'));
    }

    return blocks;
  }

  /**
   * Parse a single finding block into a ReviewComment.
   */
  private parseFindingBlock(block: string): ReviewComment | null {
    const fileMatch =
      block.match(/\*\*File:\*\*\s*`([^`]+)`/i) ||
      block.match(/File:\s*`([^`]+)`/i) ||
      block.match(/file:\s*(\S+\.\w+)/i);
    const lineMatch =
      block.match(/\*\*Line:\*\*\s*(\d+)/i) ||
      block.match(/Line:\s*(\d+)/i) ||
      block.match(/line\s+(\d+)/i);
    const categoryMatch =
      block.match(/\*\*Category:\*\*\s*(\w+)/i) || block.match(/Category:\s*(\w+)/i);
    const severityMatch =
      block.match(/\*\*Severity:\*\*\s*(\w+)/i) || block.match(/Severity:\s*(\w+)/i);
    const descriptionMatch =
      block.match(/\*\*Description:\*\*\s*(.+?)(?=\n\*\*|\n\n|$)/is) ||
      block.match(/Description:\s*(.+?)(?=\n\*|\n\n|$)/is);
    const suggestionMatch =
      block.match(/\*\*Suggestion:\*\*\s*(.+?)(?=\n\*\*|\n\n|$)/is) ||
      block.match(/Suggestion:\s*(.+?)(?=\n\*|\n\n|$)/is);

    const description = descriptionMatch?.[1]?.trim();
    if (!description || description.length < 10) return null;

    return {
      id: createReviewCommentId(),
      category: this.mapCategory(categoryMatch?.[1]),
      severity: this.mapSeverity(severityMatch?.[1]),
      file: fileMatch?.[1],
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      message: description,
      suggestion: suggestionMatch?.[1]?.trim(),
    };
  }

  /**
   * Map category string from LLM response to ReviewCategory.
   */
  private mapCategory(category?: string): ReviewCategory {
    if (!category) return 'clarity';
    const normalized = category.toLowerCase();
    switch (normalized) {
      case 'bug':
      case 'error':
      case 'correctness':
        return 'bug';
      case 'performance':
      case 'perf':
      case 'efficiency':
        return 'performance';
      case 'security':
      case 'vulnerability':
      case 'safety':
        return 'security';
      case 'clarity':
      case 'readability':
      case 'maintainability':
      case 'style':
      case 'documentation':
        return 'clarity';
      default:
        return 'clarity';
    }
  }

  /**
   * Map severity string from LLM response to ReviewSeverity.
   */
  private mapSeverity(severity?: string): ReviewSeverity {
    if (!severity) return 'minor';
    const normalized = severity.toLowerCase();
    switch (normalized) {
      case 'critical':
      case 'blocker':
      case 'high':
        return 'critical';
      case 'major':
      case 'medium':
      case 'warning':
        return 'major';
      case 'minor':
      case 'low':
      case 'suggestion':
      case 'info':
      case 'nit':
        return 'minor';
      default:
        return 'minor';
    }
  }

  /**
   * Generate a fix prompt for review comments.
   */
  generateFixPrompt(review: Review, commentIds?: string[]): string {
    const comments = commentIds
      ? review.comments.filter((c) => commentIds.includes(c.id))
      : review.comments;

    const contextManager = new ContextManager();
    const projectContext = this.buildProjectContext(this.workingDir, contextManager);

    const promptData: ReviewFixPromptData = {
      query: review.query,
      reviewComments: comments,
      projectContext,
      agentsMd: null, // Will be populated by template
    };

    return this.templateEngine.render(
      'review-fix',
      promptData as unknown as Record<string, unknown>
    );
  }

  /**
   * Build a project context string.
   */
  private buildProjectContext(cwd: string, contextManager: ContextManager): string {
    const { summary, packageJson } = contextManager.gatherSync(cwd);
    const parts: string[] = [];

    parts.push(`Working directory: ${cwd}`);
    const langSummary = Object.entries(summary.languages)
      .map(([lang, info]) => `${lang} (${info.files} files, ${info.lines} lines)`)
      .join(', ');
    if (langSummary) parts.push(`Languages: ${langSummary}`);
    parts.push(`Total files: ${summary.totalFiles}, Total lines: ${summary.totalLines}`);

    if (packageJson) {
      if (packageJson.name) parts.push(`Package: ${packageJson.name}`);
      if (packageJson.description) parts.push(`Description: ${packageJson.description}`);
    }

    return parts.join('\n');
  }

  /**
   * Build a review summary from parsed comments.
   */
  private buildSummary(comments: ReviewComment[]): ReviewSummary {
    const byCategory: Record<ReviewCategory, number> = {
      bug: 0,
      performance: 0,
      security: 0,
      clarity: 0,
    };
    const bySeverity: Record<ReviewSeverity, number> = {
      critical: 0,
      major: 0,
      minor: 0,
    };

    for (const comment of comments) {
      byCategory[comment.category]++;
      bySeverity[comment.severity]++;
    }

    // Determine overall assessment
    let overallAssessment: string;
    if (bySeverity.critical > 0 || byCategory.security > 0) {
      overallAssessment = 'NEEDS_CHANGES';
    } else if (bySeverity.major > 0 || byCategory.bug > 0) {
      overallAssessment = 'HAS_CONCERNS';
    } else {
      overallAssessment = 'APPROVED';
    }

    // Extract top 3 key findings (prioritize by severity then category)
    const keyFindings = comments
      .sort((a, b) => {
        const severityOrder: Record<ReviewSeverity, number> = { critical: 0, major: 1, minor: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        const categoryOrder: Record<ReviewCategory, number> = {
          security: 0,
          bug: 1,
          performance: 2,
          clarity: 3,
        };
        return categoryOrder[a.category] - categoryOrder[b.category];
      })
      .slice(0, 3)
      .map(
        (c) =>
          `[${c.severity.toUpperCase()}/${c.category.toUpperCase()}] ${c.file ? `${c.file}: ` : ''}${c.message.slice(0, 100)}`
      );

    return {
      totalComments: comments.length,
      byCategory,
      bySeverity,
      overallAssessment,
      keyFindings,
    };
  }
}
