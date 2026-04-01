import fs from 'node:fs';
import ora from 'ora';
import { getLogger } from '../utils/logger.js';
import { FileAnalyzer } from '../core/file-analyzer.js';
import { ContextManager } from '../core/context-manager.js';
import { LLMService } from '../integrations/llm/llm-service.js';
import type { Plan, PlanStep } from '../models/plan.js';
import { createPlanId, createPlanStepId } from '../models/plan.js';
import { TemplateEngine } from './template-engine.js';
import type { StreamCallback } from '../integrations/llm/types.js';

// ─── Plan Prompt Data ──────────────────────────────────────────────────────

export interface PlanPromptData {
  query: string;
  projectDescription: string;
  projectContext: {
    totalFiles: number;
    totalLines: number;
    languages: Record<string, { files: number; lines: number }>;
  };
  relevantFiles: {
    relativePath: string;
    language: string;
    symbols: string[];
    content: string;
  }[];
  agentsMd: string | null;
}

// ─── Plan Generator ────────────────────────────────────────────────────────

export class PlanGenerator {
  private logger = getLogger();

  constructor(
    private readonly llmService: LLMService,
    private readonly templateEngine: TemplateEngine,
    private readonly workingDir: string
  ) {}

  async generate(query: string, specificFiles?: string[]): Promise<Plan> {
    this.logger.info(`Generating plan for: ${query}`);

    // 1. Gather project context
    const contextManager = new ContextManager();
    const context = await contextManager.gatherWithCodebase(this.workingDir);

    // 2. Analyze codebase and find relevant files
    const analyzer = new FileAnalyzer(this.workingDir);
    let relevantFiles;

    if (specificFiles && specificFiles.length > 0) {
      // Use user-specified files
      const allFiles = context.codebase.files;
      relevantFiles = allFiles.filter((f) =>
        specificFiles.some((sf) => f.relativePath.includes(sf) || f.path.includes(sf))
      );
    } else {
      relevantFiles = analyzer.findRelevantFiles(context.codebase, query);
    }

    // 3. Build prompt data
    const promptData = this.buildPromptData(query, context, relevantFiles);

    // 4. Render the plan template
    const prompt = this.templateEngine.renderPlanTemplate(promptData);

    this.logger.debug('Plan prompt built, sending to LLM...');

    // 5. Call LLM with step-level profile
    const stepOptions = this.llmService.getStepOptions('planning');
    const response = await this.llmService.complete(prompt, {
      ...stepOptions,
      maxTokens: stepOptions.maxTokens ?? 4096,
    });

    this.logger.info('LLM response received, parsing plan...');

    // 6. Parse response into Plan
    const plan = this.parsePlanResponse(response.content, query);

    return plan;
  }

  /**
   * Stream a plan generation with real-time output.
   */
  async generateStream(
    query: string,
    specificFiles: string[] | undefined,
    onChunk?: StreamCallback
  ): Promise<Plan> {
    this.logger.info(`Streaming plan generation for: ${query}`);

    const spinner = ora('Gathering project context...').start();

    const contextManager = new ContextManager();
    const context = await contextManager.gatherWithCodebase(this.workingDir);

    const analyzer = new FileAnalyzer(this.workingDir);
    let relevantFiles;

    if (specificFiles && specificFiles.length > 0) {
      const allFiles = context.codebase.files;
      relevantFiles = allFiles.filter((f) =>
        specificFiles.some((sf) => f.relativePath.includes(sf) || f.path.includes(sf))
      );
    } else {
      relevantFiles = analyzer.findRelevantFiles(context.codebase, query);
    }

    spinner.text = `Analyzing ${relevantFiles.length} relevant files...`;

    const promptData = this.buildPromptData(query, context, relevantFiles);
    const prompt = this.templateEngine.renderPlanTemplate(promptData);

    spinner.text = 'Generating plan via LLM (streaming)...';

    let fullContent = '';
    const response = await this.llmService.stream(prompt, {
      maxTokens: 4096,
      onChunk: (chunk: string) => {
        fullContent += chunk;
        if (onChunk) {
          onChunk(chunk);
        }
        spinner.text = `Generating plan... (${fullContent.length} chars received)`;
      },
    });

    spinner.succeed(
      `Plan generated (${response.usage.inputTokens + response.usage.outputTokens} tokens)`
    );
    process.stdout.write('\n');

    const plan = this.parsePlanResponse(response.content, query);
    return plan;
  }

  private buildPromptData(
    query: string,
    context: Awaited<ReturnType<ContextManager['gatherWithCodebase']>>,
    relevantFiles: ReturnType<FileAnalyzer['findRelevantFiles']>
  ): PlanPromptData {
    const projectDescription = this.buildProjectDescription(context);

    const filesWithContent = relevantFiles.map((file) => {
      let content = '';
      try {
        const raw = fs.readFileSync(file.path, 'utf-8');
        // Truncate large files to keep prompt manageable
        content = raw.length > 3000 ? raw.slice(0, 3000) + '\n// ... (truncated)' : raw;
      } catch {
        content = '// (unable to read file)';
      }

      return {
        relativePath: file.relativePath,
        language: file.language,
        symbols: file.symbols.map((s) => `${s.kind}:${s.name}`),
        content,
      };
    });

    return {
      query,
      projectDescription,
      projectContext: context.summary,
      relevantFiles: filesWithContent,
      agentsMd: context.agentsMd,
    };
  }

  private buildProjectDescription(
    context: Awaited<ReturnType<ContextManager['gatherWithCodebase']>>
  ): string {
    const parts: string[] = [];

    parts.push(`Working directory: ${context.workingDirectory}`);

    const langSummary = Object.entries(context.summary.languages)
      .map(([lang, info]) => `${lang} (${info.files} files, ${info.lines} lines)`)
      .join(', ');
    parts.push(`Languages: ${langSummary}`);
    parts.push(
      `Total files: ${context.summary.totalFiles}, Total lines: ${context.summary.totalLines}`
    );

    if (context.packageJson) {
      const pkg = context.packageJson;
      if (pkg.name) parts.push(`Package: ${pkg.name}`);
      if (pkg.description) parts.push(`Description: ${pkg.description}`);
    }

    return parts.join('\n');
  }

  // ─── Plan Parsing ──────────────────────────────────────────────────────

  parsePlanResponse(markdown: string, query: string): Plan {
    const steps = this.parseSteps(markdown);
    const rationale = this.parseRationale(markdown);
    const mermaidDiagram = this.extractMermaidDiagram(markdown);

    if (steps.length === 0) {
      // If we couldn't parse structured steps, treat the whole response as a single step
      this.logger.warn('No structured steps found, creating single step from response');
      steps.push({
        id: createPlanStepId(0),
        title: query,
        description: markdown.trim(),
        files: this.extractAllFileReferences(markdown),
      });
    }

    return {
      id: createPlanId(),
      steps,
      mermaidDiagram,
      rationale,
      iterations: [],
    };
  }

  private parseSteps(markdown: string): PlanStep[] {
    const steps: PlanStep[] = [];

    // Match ## Step N: Title or ## Step N - Title or ### Step N: Title patterns
    const stepRegex = /^#{2,3}\s+Step\s+(\d+)\s*[-:—]\s*(.+)$/gim;
    let match: RegExpExecArray | null;
    const stepMatches: { index: number; stepNum: number; title: string }[] = [];

    while ((match = stepRegex.exec(markdown)) !== null) {
      stepMatches.push({
        index: match.index,
        stepNum: parseInt(match[1]!, 10),
        title: match[2]!.trim(),
      });
    }

    for (let i = 0; i < stepMatches.length; i++) {
      const current = stepMatches[i]!;
      const nextIndex = i + 1 < stepMatches.length ? stepMatches[i + 1]!.index : markdown.length;
      const block = markdown.slice(current.index, nextIndex);

      const description = this.extractStepDescription(block);
      const files = this.extractAllFileReferences(block);
      const symbols = this.extractSymbols(block);

      steps.push({
        id: createPlanStepId(current.stepNum - 1),
        title: current.title,
        description,
        files,
        symbols: symbols.length > 0 ? symbols : undefined,
      });
    }

    return steps;
  }

  private extractStepDescription(block: string): string {
    // Remove the step header line
    const lines = block.split('\n').filter((line) => {
      const trimmed = line.trim();
      // Skip the header line
      if (trimmed.match(/^#{2,3}\s+Step\s+\d+/i)) return false;
      // Skip the rationale section if embedded
      if (trimmed.match(/^#{1,3}\s+Rationale/i)) return false;
      // Skip mermaid blocks
      if (trimmed.startsWith('```mermaid')) return false;
      if (trimmed === '```' && block.includes('```mermaid')) return false;
      return true;
    });

    return lines.join('\n').trim();
  }

  private extractAllFileReferences(block: string): string[] {
    const files = new Set<string>();

    // Pattern 1: Backtick file references like `src/file.ts`
    const backtickPattern =
      /`([^`]*\.(?:ts|tsx|js|jsx|py|go|rs|java|vue|svelte|json|yaml|yml|md|css|scss|html|xml))`/gi;
    let m: RegExpExecArray | null;
    while ((m = backtickPattern.exec(block)) !== null) {
      files.add(m[1]!.trim());
    }

    // Pattern 2: Bare file paths with extensions in square brackets
    const bracketPattern =
      /\[([^\]]*\.(?:ts|tsx|js|jsx|py|go|rs|java|vue|svelte|json|yaml|yml|md|css|scss|html|xml))\]/gi;
    while ((m = bracketPattern.exec(block)) !== null) {
      files.add(m[1]!.trim());
    }

    return [...files];
  }

  private extractSymbols(block: string): string[] {
    const symbols = new Set<string>();

    // Match symbol patterns like `ClassName`, `functionName`, `InterfaceName` within backticks
    // but not file paths (no extension)
    const symbolPattern = /`([A-Z][a-zA-Z0-9]*)`/g;
    let m: RegExpExecArray | null;
    while ((m = symbolPattern.exec(block)) !== null) {
      const captured = m[1];
      if (captured && captured.length > 1) {
        const firstChar = captured.charAt(0);
        if (firstChar === firstChar.toUpperCase()) {
          symbols.add(captured.trim());
        }
      }
    }

    return [...symbols];
  }

  private parseRationale(markdown: string): string {
    // Look for a Rationale section
    const rationaleMatch = markdown.match(/^#{1,3}\s+Rationale\s*\n([\s\S]*?)(?=^#{1,3}\s|$)/gim);

    if (rationaleMatch && rationaleMatch.length > 0) {
      // Remove the header line from each match
      return rationaleMatch
        .map((section) => section.replace(/^#{1,3}\s+Rationale\s*\n?/i, '').trim())
        .join('\n\n');
    }

    // Look for rationale in the last paragraph if no header found
    const paragraphs = markdown.split(/\n\n+/).filter((p) => p.trim().length > 0);
    if (paragraphs.length > 0) {
      const last = paragraphs[paragraphs.length - 1]!.trim();
      // Check if it looks like a rationale (not a step, not code)
      if (!last.startsWith('#') && !last.startsWith('```') && !last.match(/^Step \d+/i)) {
        return last;
      }
    }

    return '';
  }

  private extractMermaidDiagram(markdown: string): string | undefined {
    const mermaidMatch = markdown.match(/```mermaid\n([\s\S]*?)```/);
    if (mermaidMatch) {
      return mermaidMatch[1]!.trim();
    }
    return undefined;
  }
}
