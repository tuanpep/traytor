import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../utils/logger.js';
import type { PlanPromptData } from './plan-generator.js';
import type { PhasePromptData } from './phase-generator.js';

// ─── Template Data Types ───────────────────────────────────────────────────

export interface VerificationPromptData {
  planId: string;
  query: string;
  steps: {
    title: string;
    description: string;
    files: string[];
  }[];
  codeChanges: string;
  previousComments?: {
    id: string;
    status: string;
    file?: string;
    category: string;
    message: string;
    suggestion?: string;
  }[];
}

export interface ReviewPromptData {
  query: string;
  scopeDescription: string;
  projectDescription: string;
  files: {
    relativePath: string;
    language: string;
    lineCount?: number;
    symbols: { name: string; kind: string }[];
    content: string;
  }[];
  agentsMd?: string | null;
}

export interface UserQueryPromptData {
  userQuery: string;
  basePrompt?: string;
  agentsMd?: string | null;
  taskId?: string;
  timestamp?: string;
}

export interface ClarificationPromptData {
  query: string;
  projectContext: string;
}

export interface TemplateInfo {
  name: string;
  source: 'builtin' | 'custom';
  path: string;
}

// ─── Template Engine ───────────────────────────────────────────────────────

export class TemplateEngine {
  private logger = getLogger();
  private readonly builtinTemplateDir: string;
  private customTemplateDir?: string;

  constructor(customTemplateDir?: string) {
    // Resolve built-in templates relative to this file
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    // In bundled code, this file is at dist/index.js, so templates are at ./templates
    // In source, this file is at src/services/template-engine.ts, so templates are at ../templates
    const possibleTemplateDirs = [
      path.resolve(thisDir, 'templates'), // For bundled code (dist/index.js -> dist/templates)
      path.resolve(thisDir, '..', 'templates'), // For source (src/services -> src/templates)
    ];

    this.builtinTemplateDir =
      possibleTemplateDirs.find((dir) => {
        const exists = fs.existsSync(dir);
        if (exists) {
          this.logger.debug(`Using builtin template directory: ${dir}`);
        }
        return exists;
      }) || possibleTemplateDirs[1]!; // Default to ../templates if none exist

    if (customTemplateDir) {
      this.customTemplateDir = path.resolve(customTemplateDir);
      this.logger.debug(`Custom template directory: ${this.customTemplateDir}`);
    }
  }

  // ─── Handlebars Helpers ────────────────────────────────────────────────

  private registerHelpers(): void {
    if ((Handlebars as unknown as Record<string, boolean>).__helpersRegistered) return;

    Handlebars.registerHelper('json', function (context: unknown): string {
      return JSON.stringify(context, null, 2);
    });

    Handlebars.registerHelper('uppercase', function (str: unknown): string {
      return String(str).toUpperCase();
    });

    Handlebars.registerHelper('lowercase', function (str: unknown): string {
      return String(str).toLowerCase();
    });

    (Handlebars as unknown as Record<string, boolean>).__helpersRegistered = true;
  }

  // ─── Template Loading ──────────────────────────────────────────────────

  private loadTemplate(name: string): string {
    const searchedPaths: string[] = [];

    // Try custom template directory first
    if (this.customTemplateDir) {
      const customPath = path.join(this.customTemplateDir, `${name}.hbs`);
      searchedPaths.push(customPath);
      if (fs.existsSync(customPath)) {
        this.logger.debug(`Loading custom template: ${customPath}`);
        return fs.readFileSync(customPath, 'utf-8');
      }
    }

    // Fall back to built-in templates
    const builtinPath = path.join(this.builtinTemplateDir, `${name}.hbs`);
    searchedPaths.push(builtinPath);
    if (fs.existsSync(builtinPath)) {
      this.logger.debug(`Loading built-in template: ${builtinPath}`);
      return fs.readFileSync(builtinPath, 'utf-8');
    }

    // Enhanced error message with context
    const errorMsg = [
      `Template "${name}" not found.`,
      '',
      'Searched paths:',
      ...searchedPaths.map((p) => `  - ${p}`),
      '',
      'Suggestions:',
      '  - Run "traytor template list" to see available templates',
      '  - Check that templates were included in the build (dist/templates/)',
      '  - Verify the build completed successfully with "pnpm build"',
    ].join('\n');

    throw new Error(errorMsg);
  }

  // ─── Public API ────────────────────────────────────────────────────────

  renderPlanTemplate(data: PlanPromptData): string {
    this.registerHelpers();
    const source = this.loadTemplate('plan');
    const template = Handlebars.compile(source);
    return template(data);
  }

  renderVerificationTemplate(data: VerificationPromptData): string {
    this.registerHelpers();
    const source = this.loadTemplate('verification');
    const template = Handlebars.compile(source);
    return template(data);
  }

  renderPhasesTemplate(data: PhasePromptData): string {
    this.registerHelpers();
    const source = this.loadTemplate('phases');
    const template = Handlebars.compile(source);
    return template(data);
  }

  renderReviewTemplate(data: ReviewPromptData): string {
    this.registerHelpers();
    const source = this.loadTemplate('review');
    const template = Handlebars.compile(source);
    return template(data);
  }

  renderUserQueryTemplate(data: UserQueryPromptData): string {
    this.registerHelpers();
    const source = this.loadTemplate('user-query');
    const template = Handlebars.compile(source);
    return template(data);
  }

  renderClarificationTemplate(data: ClarificationPromptData): string {
    this.registerHelpers();
    const source = this.loadTemplate('clarification');
    const template = Handlebars.compile(source);
    return template(data);
  }

  /**
   * List all available templates (builtin and custom).
   */
  listTemplates(): TemplateInfo[] {
    const templates: TemplateInfo[] = [];

    // List builtin templates
    try {
      const builtinFiles = fs
        .readdirSync(this.builtinTemplateDir)
        .filter((f) => f.endsWith('.hbs'));
      for (const file of builtinFiles) {
        const name = file.replace('.hbs', '');
        templates.push({
          name,
          source: 'builtin',
          path: path.join(this.builtinTemplateDir, file),
        });
      }
    } catch {
      // builtin dir might not exist
    }

    // List custom templates (may override builtins)
    if (this.customTemplateDir) {
      try {
        const customFiles = fs
          .readdirSync(this.customTemplateDir)
          .filter((f) => f.endsWith('.hbs'));
        for (const file of customFiles) {
          const name = file.replace('.hbs', '');
          // Check if it overrides a builtin
          const existingIndex = templates.findIndex((t) => t.name === name);
          if (existingIndex >= 0) {
            templates[existingIndex] = {
              name,
              source: 'custom',
              path: path.join(this.customTemplateDir, file),
            };
          } else {
            templates.push({
              name,
              source: 'custom',
              path: path.join(this.customTemplateDir, file),
            });
          }
        }
      } catch {
        // custom dir might not exist
      }
    }

    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Render an arbitrary template with the given data.
   * Tries custom directory first, then built-in.
   */
  render(name: string, data: Record<string, unknown>): string {
    this.registerHelpers();
    const source = this.loadTemplate(name);
    const template = Handlebars.compile(source);
    return template(data);
  }
}
