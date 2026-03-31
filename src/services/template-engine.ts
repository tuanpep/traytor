import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../utils/logger.js';
import type { PlanPromptData } from './plan-generator.js';

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
}

// ─── Template Engine ───────────────────────────────────────────────────────

export class TemplateEngine {
  private logger = getLogger();
  private readonly builtinTemplateDir: string;
  private customTemplateDir?: string;

  constructor(customTemplateDir?: string) {
    // Resolve built-in templates relative to this file
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    this.builtinTemplateDir = path.resolve(thisDir, '..', 'templates');

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
    // Try custom template directory first
    if (this.customTemplateDir) {
      const customPath = path.join(this.customTemplateDir, `${name}.hbs`);
      if (fs.existsSync(customPath)) {
        this.logger.debug(`Loading custom template: ${customPath}`);
        return fs.readFileSync(customPath, 'utf-8');
      }
    }

    // Fall back to built-in templates
    const builtinPath = path.join(this.builtinTemplateDir, `${name}.hbs`);
    if (fs.existsSync(builtinPath)) {
      this.logger.debug(`Loading built-in template: ${builtinPath}`);
      return fs.readFileSync(builtinPath, 'utf-8');
    }

    throw new Error(`Template "${name}" not found in built-in or custom template directories`);
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
