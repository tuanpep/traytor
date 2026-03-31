import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TemplateEngine } from '../src/services/template-engine.js';
import type { PlanPromptData } from '../src/services/plan-generator.js';

describe('TemplateEngine', () => {
  let tmpDir: string;
  let engine: TemplateEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-tmpl-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('built-in templates', () => {
    it('loads and renders the plan template', () => {
      engine = new TemplateEngine();
      const data: PlanPromptData = {
        query: 'Add user authentication',
        projectDescription: 'A web application built with TypeScript',
        projectContext: {
          totalFiles: 42,
          totalLines: 1500,
          languages: {
            typescript: { files: 30, lines: 1200 },
            css: { files: 12, lines: 300 },
          },
        },
        relevantFiles: [
          {
            relativePath: 'src/auth/service.ts',
            language: 'typescript',
            symbols: ['function:login', 'class:AuthService'],
            content: 'export class AuthService { login() {} }',
          },
        ],
        agentsMd: null,
      };

      const result = engine.renderPlanTemplate(data);

      expect(result).toContain('Add user authentication');
      expect(result).toContain('A web application built with TypeScript');
      expect(result).toContain('Total files: 42');
      expect(result).toContain('typescript: 30 files, 1200 lines');
      expect(result).toContain('src/auth/service.ts');
      expect(result).toContain('AuthService');
      expect(result).toContain('export class AuthService');
    });

    it('loads and renders the verification template', () => {
      engine = new TemplateEngine();
      const data = {
        planId: 'plan_123',
        query: 'Add auth',
        steps: [
          { title: 'Create middleware', description: 'Auth middleware', files: ['auth.ts'] },
          { title: 'Add routes', description: 'Login routes', files: ['routes.ts'] },
        ],
        codeChanges: 'export function login() {}',
      };

      const result = engine.renderVerificationTemplate(data);

      expect(result).toContain('plan_123');
      expect(result).toContain('Add auth');
      expect(result).toContain('Create middleware');
      expect(result).toContain('Add routes');
      expect(result).toContain('auth.ts');
      expect(result).toContain('export function login() {}');
    });

    it('includes agents.md content when present', () => {
      engine = new TemplateEngine();
      const data: PlanPromptData = {
        query: 'Test',
        projectDescription: 'Test project',
        projectContext: { totalFiles: 1, totalLines: 10, languages: { typescript: { files: 1, lines: 10 } } },
        relevantFiles: [],
        agentsMd: 'Always use TypeScript strict mode.\nPrefer const over let.',
      };

      const result = engine.renderPlanTemplate(data);

      expect(result).toContain('AGENTS.md');
      expect(result).toContain('Always use TypeScript strict mode');
      expect(result).toContain('Prefer const over let');
    });

    it('omits agents.md section when null', () => {
      engine = new TemplateEngine();
      const data: PlanPromptData = {
        query: 'Test',
        projectDescription: 'Test project',
        projectContext: { totalFiles: 1, totalLines: 10, languages: { typescript: { files: 1, lines: 10 } } },
        relevantFiles: [],
        agentsMd: null,
      };

      const result = engine.renderPlanTemplate(data);

      expect(result).not.toContain('AGENTS.md');
    });
  });

  describe('custom templates', () => {
    it('loads custom template from custom directory', () => {
      // Create a custom template
      const customDir = path.join(tmpDir, 'templates');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(
        path.join(customDir, 'plan.hbs'),
        'Custom plan for: {{query}} with {{projectContext.totalFiles}} files.'
      );

      engine = new TemplateEngine(customDir);
      const data: PlanPromptData = {
        query: 'Add feature',
        projectDescription: 'Test',
        projectContext: { totalFiles: 5, totalLines: 100, languages: {} },
        relevantFiles: [],
        agentsMd: null,
      };

      const result = engine.renderPlanTemplate(data);

      expect(result).toBe('Custom plan for: Add feature with 5 files.');
    });

    it('falls back to built-in template when custom not found', () => {
      engine = new TemplateEngine(tmpDir); // dir exists but no plan.hbs in it
      const data: PlanPromptData = {
        query: 'Test fallback',
        projectDescription: 'Test',
        projectContext: { totalFiles: 1, totalLines: 10, languages: {} },
        relevantFiles: [],
        agentsMd: null,
      };

      const result = engine.renderPlanTemplate(data);

      // Should contain content from built-in template
      expect(result).toContain('Test fallback');
      expect(result).toContain('software architecture assistant');
    });
  });

  describe('Handlebars helpers', () => {
    it('json helper serializes objects', () => {
      const customDir = path.join(tmpDir, 'templates');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(
        path.join(customDir, 'json-test.hbs'),
        '{{{json data}}}'
      );

      engine = new TemplateEngine(customDir);
      const result = engine.render('json-test', {
        data: { name: 'test', value: 42 },
      });

      expect(result).toContain('"name": "test"');
      expect(result).toContain('"value": 42');
    });

    it('render method works with arbitrary template data', () => {
      // Create a custom template that uses all helpers
      const customDir = path.join(tmpDir, 'templates');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(
        path.join(customDir, 'helper-test.hbs'),
        '{{uppercase name}} / {{lowercase name}} / {{{json meta}}}'
      );

      engine = new TemplateEngine(customDir);
      const result = engine.render('helper-test', {
        name: 'Hello World',
        meta: { key: 'value' },
      });

      expect(result).toContain('HELLO WORLD');
      expect(result).toContain('hello world');
      expect(result).toContain('"key": "value"');
    });
  });

  describe('error handling', () => {
    it('throws when template not found', () => {
      engine = new TemplateEngine();
      expect(() => engine.render('nonexistent-template', {})).toThrow('Template "nonexistent-template" not found');
    });
  });
});
