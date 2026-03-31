import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getLogger } from '../utils/logger.js';
import { FileAnalyzer, type Codebase } from './file-analyzer.js';
import type { Task } from '../models/task.js';

// ─── AGENTS.md Parsing Types ────────────────────────────────────────────────

export interface AgentsMdDirective {
  type: 'instruction' | 'preference' | 'convention' | 'tool' | 'file_pattern';
  content: string;
  raw: string;
}

export interface AgentsMdParseResult {
  raw: string;
  path: string | null;
  directives: AgentsMdDirective[];
}

export interface ProjectContext {
  workingDirectory: string;
  summary: Codebase['summary'];
  agentsMd: string | null;
  agentsMdParsed: AgentsMdParseResult | null;
  projectConfig: Record<string, unknown> | null;
  packageJson: Record<string, unknown> | null;
}

export interface ProjectContextSync {
  workingDirectory: string;
  summary: {
    totalFiles: number;
    totalLines: number;
    languages: Record<string, { files: number; lines: number }>;
  };
  agentsMd: string | null;
  packageJson: Record<string, unknown> | null;
}

export class ContextManager {
  private logger = getLogger();

  async gather(workingDirectory: string, task?: Task): Promise<ProjectContext> {
    this.logger.info(`Gathering context from ${workingDirectory}`);

    const resolvedDir = path.resolve(workingDirectory);
    const analyzer = new FileAnalyzer(resolvedDir);
    const codebase = await analyzer.analyze();

    const agentsMdResult = this.findAgentsMd(resolvedDir);
    const projectConfig = this.loadProjectConfig(resolvedDir);
    const packageJson = this.loadPackageJson(resolvedDir);

    const agentsMd = agentsMdResult ? agentsMdResult.raw : null;
    const agentsMdParsed = agentsMdResult ?? null;

    // Use task if provided (reserved for future task-aware context gathering)
    void task;

    return {
      workingDirectory: resolvedDir,
      summary: codebase.summary,
      agentsMd,
      agentsMdParsed,
      projectConfig,
      packageJson,
    };
  }

  async gatherWithCodebase(
    workingDirectory: string,
    task?: Task
  ): Promise<ProjectContext & { codebase: Codebase }> {
    this.logger.info(`Gathering context with codebase from ${workingDirectory}`);

    const resolvedDir = path.resolve(workingDirectory);
    const analyzer = new FileAnalyzer(resolvedDir);
    const codebase = await analyzer.analyze();

    const agentsMdResult = this.findAgentsMd(resolvedDir);
    const projectConfig = this.loadProjectConfig(resolvedDir);
    const packageJson = this.loadPackageJson(resolvedDir);

    const agentsMd = agentsMdResult ? agentsMdResult.raw : null;
    const agentsMdParsed = agentsMdResult ?? null;

    // Use task if provided (reserved for future task-aware context gathering)
    void task;

    return {
      workingDirectory: resolvedDir,
      summary: codebase.summary,
      agentsMd,
      agentsMdParsed,
      projectConfig,
      packageJson,
      codebase,
    };
  }

  findAgentsMd(startDir: string): AgentsMdParseResult | null {
    let current = path.resolve(startDir);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const agentsPath = path.join(current, 'AGENTS.md');
      try {
        if (fs.existsSync(agentsPath)) {
          const content = fs.readFileSync(agentsPath, 'utf-8');
          this.logger.debug(`Found AGENTS.md at ${agentsPath}`);
          const directives = this.parseAgentsMd(content);
          return {
            raw: content,
            path: agentsPath,
            directives,
          };
        }
      } catch {
        // Not readable, continue searching
      }

      const parent = path.dirname(current);
      // Reached filesystem root
      if (parent === current) {
        this.logger.debug('AGENTS.md not found in any parent directory');
        return null;
      }
      current = parent;
    }
  }

  /**
   * Parse AGENTS.md content into structured directives.
   *
   * Recognizes common patterns:
   * - Headings (## / ###) treated as convention sections
   * - Lines starting with "Always" / "Never" / "Prefer" / "Avoid" treated as preferences
   * - Lines starting with "Use" / "Run" / "Install" treated as tool instructions
   * - Glob patterns (*.test.ts, *.spec.*) treated as file patterns
   */
  parseAgentsMd(content: string): AgentsMdDirective[] {
    const directives: AgentsMdDirective[] = [];
    const lines = content.split('\n');
    let currentSection = 'general';

    for (const line of lines) {
      const trimmed = line.trim();

      // Track section headings
      const headingMatch = trimmed.match(/^#{1,4}\s+(.+)/);
      if (headingMatch) {
        currentSection = headingMatch[1].trim().toLowerCase();
        continue;
      }

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('<!--')) continue;

      // Classify directive types
      // Strip list markers before checking for directive types
      const strippedContent = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');

      if (strippedContent.match(/^(always|never|prefer|avoid|must|should|don't|do not)\b/i)) {
        directives.push({
          type: 'preference',
          content: trimmed,
          raw: line,
        });
      } else if (strippedContent.match(/^(use|run|install|execute|invoke)\b/i)) {
        directives.push({
          type: 'tool',
          content: trimmed,
          raw: line,
        });
      } else if (
        trimmed.match(
          /[*].*\.(?:ts|tsx|js|jsx|py|go|rs|java|vue|svelte|json|yaml|yml|md|css|scss|html|xml|spec|test)[*]?/
        )
      ) {
        directives.push({
          type: 'file_pattern',
          content: trimmed,
          raw: line,
        });
      } else if (trimmed.match(/^[-*]\s/) || trimmed.match(/^\d+\.\s/)) {
        // List items under a heading are conventions
        directives.push({
          type: currentSection === 'general' ? 'instruction' : 'convention',
          content: trimmed,
          raw: line,
        });
      } else if (trimmed.length > 10) {
        // Substantial non-heading text is an instruction
        directives.push({
          type: 'instruction',
          content: trimmed,
          raw: line,
        });
      }
    }

    return directives;
  }

  loadProjectConfig(projectDir: string): Record<string, unknown> | null {
    const configPath = path.join(projectDir, '.sdd-tool', 'config.yaml');
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = parseYaml(content);
        this.logger.debug(`Loaded project config from ${configPath}`);
        return config as Record<string, unknown>;
      }
    } catch (error) {
      this.logger.warn(`Failed to load project config: ${error}`);
    }
    return null;
  }

  loadPackageJson(projectDir: string): Record<string, unknown> | null {
    const pkgPath = path.join(projectDir, 'package.json');
    try {
      if (fs.existsSync(pkgPath)) {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        this.logger.debug(`Loaded package.json from ${pkgPath}`);
        return pkg as Record<string, unknown>;
      }
    } catch (error) {
      this.logger.warn(`Failed to load package.json: ${error}`);
    }
    return null;
  }

  gatherSync(workingDirectory: string): ProjectContextSync {
    const resolvedDir = path.resolve(workingDirectory);
    const analyzer = new FileAnalyzer(resolvedDir);
    const codebase = analyzer.analyzeSync();

    const agentsMdResult = this.findAgentsMd(resolvedDir);
    const packageJson = this.loadPackageJson(resolvedDir);

    const agentsMd = agentsMdResult ? agentsMdResult.raw : null;

    return {
      workingDirectory: resolvedDir,
      summary: codebase.summary,
      agentsMd,
      packageJson,
    };
  }
}
