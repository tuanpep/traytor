import fs from 'node:fs';
import { getLogger } from '../utils/logger.js';
import { FileAnalyzer } from '../core/file-analyzer.js';
import { ContextManager } from '../core/context-manager.js';
import { LLMService } from '../integrations/llm/llm-service.js';
import { TemplateEngine } from './template-engine.js';
import type { Phase } from '../models/phase.js';
import { createPhaseId } from '../models/phase.js';
import type { PhaseContextCarryOver } from '../models/phase.js';

// ─── Phase Generation Prompt Data ──────────────────────────────────────────

export interface PhasePromptData {
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
  previousContext?: {
    order: number;
    name: string;
    description: string;
    status: string;
  }[];
}

// ─── Phase Generator ──────────────────────────────────────────────────────

export class PhaseGenerator {
  private logger = getLogger();

  constructor(
    private readonly llmService: LLMService,
    private readonly templateEngine: TemplateEngine,
    private readonly workingDir: string
  ) {}

  /**
   * Generate phases for a complex task by asking the LLM to break it down.
   */
  async generate(query: string, specificFiles?: string[], previousPhases?: Phase[]): Promise<Phase[]> {
    this.logger.info(`Generating phases for: ${query}`);

    // 1. Gather project context
    const contextManager = new ContextManager();
    const context = await contextManager.gatherWithCodebase(this.workingDir);

    // 2. Analyze codebase and find relevant files
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

    // 3. Build prompt data
    const promptData = this.buildPromptData(query, context, relevantFiles, previousPhases);

    // 4. Render the phases template
    const prompt = this.templateEngine.renderPhasesTemplate(promptData);

    this.logger.debug('Phase prompt built, sending to LLM...');

    // 5. Call LLM
    const response = await this.llmService.complete(prompt, {
      maxTokens: 4096,
    });

    this.logger.info('LLM response received, parsing phases...');

    // 6. Parse response into Phase objects
    const phases = this.parsePhaseResponse(response.content);

    return phases;
  }

  private buildPromptData(
    query: string,
    context: Awaited<ReturnType<ContextManager['gatherWithCodebase']>>,
    relevantFiles: ReturnType<FileAnalyzer['findRelevantFiles']>,
    previousPhases?: Phase[]
  ): PhasePromptData {
    const projectDescription = this.buildProjectDescription(context);

    const filesWithContent = relevantFiles.map((file) => {
      let content = '';
      try {
        const raw = fs.readFileSync(file.path, 'utf-8');
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
      previousContext: previousPhases?.map((p) => ({
        order: p.order,
        name: p.name,
        description: p.description,
        status: p.status,
      })),
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
    parts.push(`Total files: ${context.summary.totalFiles}, Total lines: ${context.summary.totalLines}`);

    if (context.packageJson) {
      const pkg = context.packageJson;
      if (pkg.name) parts.push(`Package: ${pkg.name}`);
      if (pkg.description) parts.push(`Description: ${pkg.description}`);
    }

    return parts.join('\n');
  }

  // ─── Phase Parsing ──────────────────────────────────────────────────────

  /**
   * Parse the LLM response into Phase objects.
   */
  parsePhaseResponse(markdown: string): Phase[] {
    const phases: Phase[] = [];
    const now = new Date().toISOString();

    // Match ## Phase N: Title or ## Phase N - Title patterns
    const phaseRegex = /^#{2,3}\s+Phase\s+(\d+)\s*[:\-\—]\s*(.+)$/gim;
    let match: RegExpExecArray | null;
    const phaseMatches: { index: number; phaseNum: number; title: string }[] = [];

    while ((match = phaseRegex.exec(markdown)) !== null) {
      phaseMatches.push({
        index: match.index,
        phaseNum: parseInt(match[1], 10),
        title: match[2].trim(),
      });
    }

    for (let i = 0; i < phaseMatches.length; i++) {
      const current = phaseMatches[i];
      const nextIndex = i + 1 < phaseMatches.length ? phaseMatches[i + 1].index : markdown.length;
      const block = markdown.slice(current.index, nextIndex);

      const description = this.extractPhaseDescription(block);

      phases.push({
        id: createPhaseId(),
        name: current.title,
        description,
        status: 'pending',
        order: current.phaseNum,
        createdAt: now,
        updatedAt: now,
      });
    }

    // If we couldn't parse structured phases, treat the whole response as a single phase
    if (phases.length === 0) {
      this.logger.warn('No structured phases found, creating single phase from response');
      phases.push({
        id: createPhaseId(),
        name: 'Implementation',
        description: markdown.trim(),
        status: 'pending',
        order: 1,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Re-index orders to be sequential starting from 1
    for (let i = 0; i < phases.length; i++) {
      phases[i].order = i + 1;
    }

    return phases;
  }

  private extractPhaseDescription(block: string): string {
    const lines = block.split('\n').filter((line) => {
      const trimmed = line.trim();
      // Skip the header line
      if (trimmed.match(/^#{2,3}\s+Phase\s+\d+/i)) return false;
      // Skip the rationale section if embedded
      if (trimmed.match(/^#{1,3}\s+Rationale/i)) return false;
      return true;
    });

    return lines.join('\n').trim();
  }
}

// ─── Context Carry-Over Builder ───────────────────────────────────────────

/**
 * Build context carry-over from completed phases to inject into subsequent phase prompts.
 */
export function buildContextCarryOver(completedPhases: Phase[]): PhaseContextCarryOver {
  const filesChanged = new Set<string>();
  const decisions: string[] = [];
  const rationale: string[] = [];

  for (const phase of completedPhases) {
    // Collect files from the phase's plan
    if (phase.plan) {
      for (const step of phase.plan.steps) {
        for (const file of step.files) {
          filesChanged.add(file);
        }
      }
    }

    // Collect files from execution if available
    if (phase.execution?.history) {
      for (const entry of phase.execution.history) {
        if (entry.action.includes('file') || entry.action.includes('create') || entry.action.includes('modify')) {
          // Extract file references from history entries
          const fileRefs = entry.details?.match(/`[^`]*\.\w+`/g);
          if (fileRefs) {
            for (const ref of fileRefs) {
              filesChanged.add(ref.replace(/`/g, ''));
            }
          }
        }
      }
    }

    // Collect decisions and rationale from the plan
    if (phase.plan?.rationale) {
      rationale.push(`Phase ${phase.order} (${phase.name}): ${phase.plan.rationale}`);
    }

    // Collect verification results for context
    if (phase.verification?.summary) {
      decisions.push(`Phase ${phase.order} verification: ${phase.verification.summary}`);
    }
  }

  return {
    filesChanged: [...filesChanged],
    decisions,
    rationale,
  };
}
