# Personal Spec-Driven Development Tool - Implementation Guide

## Table of Contents

1. [Quick Start](#quick-start)
2. [Development Setup](#development-setup)
3. [Core Components Implementation](#core-components-implementation)
4. [Integration Implementation](#integration-implementation)
5. [Testing Strategy](#testing-strategy)
6. [Build & Release](#build--release)
7. [Future Enhancements](#future-enhancements)

---

## Quick Start

### 1. Initialize Project

```bash
# Create project directory
mkdir personal-sdd-tool && cd personal-sdd-tool

# Initialize package.json
pnpm init

# Install core dependencies
pnpm add commander chalk ora inquirer handlebars zod
pnpm add -D typescript @types/node tsup vitest

# Create project structure
mkdir -p src/{bin,ui,commands,services,core,data,integrations,models,config,utils,templates}
mkdir -p tests/{unit,integration}
```

### 2. Configure TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 3. Create First CLI Command

```typescript
// src/bin/sdd.ts
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('sdd')
  .description('Personal Spec-Driven Development Tool')
  .version('0.1.0');

program
  .command('hello')
  .description('Test command')
  .action(() => {
    console.log(chalk.green('Hello from SDD Tool!'));
  });

program.parse(process.argv);
```

```bash
# Test it
pnpm tsx src/bin/sdd.ts hello
```

---

## Development Setup

### Environment Variables

```bash
# Create .env file (gitignored)
echo "ANTHROPIC_API_KEY=your_key_here" > .env
echo "OPENAI_API_KEY=your_key_here" >> .env
```

### Project Configuration

```yaml
# .sdd-tool/config.yaml (project-level)
default:
  llm:
    provider: anthropic
    model: claude-3-5-sonnet
  agent:
    default: cli
    cli:
      command: claude
      args: ["$TRAYCER_PROMPT"]
```

```yaml
# ~/.sdd-tool/config.yaml (user-level)
llm:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
  openai:
    apiKey: ${OPENAI_API_KEY}

workspace:
  dataPath: ~/.sdd-tool/data
  cachePath: ~/.sdd-tool/cache
```

---

## Core Components Implementation

### 1. Data Models

```typescript
// src/models/task.ts
export interface Task {
  id: string;
  type: 'plan' | 'phases' | 'review' | 'epic';
  query: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  context: TaskContext;
  plan?: Plan;
  phases?: Phase[];
  review?: Review;
  epic?: Epic;
  executions: Execution[];
}

export interface TaskContext {
  workingDir: string;
  files?: string[];
  folders?: string[];
  gitRef?: string;
  images?: string[];
}

export function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

```typescript
// src/models/plan.ts
export interface Plan {
  id: string;
  taskId: string;
  query: string;
  steps: PlanStep[];
  rationale: string;
  mermaidDiagram?: string;
  createdAt: Date;
  iterations: PlanIteration[];
}

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  files: string[];
  symbols?: SymbolReference[];
  codeSnippet?: string;
  language?: string;
  estimatedTime?: string;
}

export interface SymbolReference {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable';
  filePath: string;
  line: number;
}
```

### 2. Storage Layer

```typescript
// src/data/storage/file-storage.ts
import fs from 'fs/promises';
import path from 'path';
import { mkdirp } from 'fs/promises';

export class FileStorage<T> {
  constructor(private basePath: string) {}

  async save(key: string, value: T): Promise<void> {
    const filePath = this.getFilePath(key);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2));
  }

  async load(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    await fs.unlink(filePath);
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getFilePath(key: string): string {
    // Convert key to safe filename
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.basePath, `${safeKey}.json`);
  }
}

// src/data/repositories/task.repository.ts
import { Task } from '../../models/task';
import { FileStorage } from '../storage/file-storage';

export class TaskRepository {
  private storage: FileStorage<Task>;

  constructor(dataPath: string) {
    this.storage = new FileStorage<Task>(path.join(dataPath, 'tasks'));
  }

  async save(task: Task): Promise<void> {
    await this.storage.save(task.id, task);
  }

  async findById(id: string): Promise<Task | null> {
    return await this.storage.load(id);
  }

  async findAll(): Promise<Task[]> {
    const tasks: Task[] = [];
    // Implementation: scan directory and load all tasks
    return tasks;
  }

  async delete(id: string): Promise<void> {
    await this.storage.delete(id);
  }
}
```

### 3. LLM Service

```typescript
// src/integrations/llm/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMOptions, LLMResponse } from './base';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(
    prompt: string,
    options: LLMOptions
  ): Promise<LLMResponse> {
    try {
      const response = await this.client.messages.create({
        model: options.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxTokens || 4096,
        system: options.system,
        messages: [{ role: 'user', content: prompt }]
      });

      return {
        content: response.content[0].text,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        },
        model: options.model || 'claude-3-5-sonnet-20241022'
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  async stream(
    prompt: string,
    options: LLMOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const stream = await this.client.messages.create({
      model: options.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 4096,
      system: options.system,
      messages: [{ role: 'user', content: prompt }],
      stream: true
    });

    let fullResponse = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const chunk = event.delta.text;
        onChunk(chunk);
        fullResponse += chunk;
      }
    }

    return fullResponse;
  }
}

// src/services/llm.service.ts
import { LLMProvider } from '../integrations/llm/base';
import { AnthropicProvider } from '../integrations/llm/anthropic';
import { OpenAIProvider } from '../integrations/llm/openai';

export class LLMService {
  private providers: Map<string, LLMProvider> = new Map();

  constructor(config: LLMConfig) {
    // Initialize providers based on config
    if (config.anthropic?.apiKey) {
      this.providers.set('anthropic', new AnthropicProvider(config.anthropic.apiKey));
    }
    if (config.openai?.apiKey) {
      this.providers.set('openai', new OpenAIProvider(config.openai.apiKey));
    }
  }

  getProvider(name: string): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`LLM provider not found: ${name}`);
    }
    return provider;
  }

  async complete(
    prompt: string,
    options: LLMOptions & { provider?: string }
  ): Promise<LLMResponse> {
    const providerName = options.provider || 'anthropic';
    const provider = this.getProvider(providerName);
    return await provider.complete(prompt, options);
  }
}
```

### 4. File Analyzer

```typescript
// src/core/file-analyzer.ts
import fs from 'fs/promises';
import { glob } from 'glob';

export class FileAnalyzer {
  private supportedExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx',
    '.py', '.go', '.rs', '.java',
    '.vue', '.svelte'
  ]);

  async analyze(context: TaskContext): Promise<Codebase> {
    const files = await this.scanFiles(context);
    const analyzedFiles = await Promise.all(
      files.map(file => this.analyzeFile(file))
    );

    return {
      files: analyzedFiles,
      structure: this.buildStructure(analyzedFiles),
      imports: this.extractImports(analyzedFiles),
      exports: this.extractExports(analyzedFiles)
    };
  }

  private async scanFiles(context: TaskContext): Promise<string[]> {
    const workingDir = context.workingDir || process.cwd();
    const patterns = context.files || ['**/*'];

    const files: string[] = [];

    for (const pattern of patterns) {
      const matched = await glob(pattern, {
        cwd: workingDir,
        absolute: true
      });

      files.push(...matched.filter(file =>
        this.supportedExtensions.has(path.extname(file))
      ));
    }

    return [...new Set(files)];
  }

  private async analyzeFile(filePath: string): Promise<AnalyzedFile> {
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);

    return {
      path: filePath,
      language,
      content,
      size: content.length,
      lines: content.split('\n').length,
      symbols: await this.extractSymbols(filePath, content, language),
      imports: this.extractImportsFromFile(content, language),
      exports: this.extractExportsFromFile(content, language)
    };
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java'
    };

    return languageMap[ext] || 'unknown';
  }

  private async extractSymbols(
    filePath: string,
    content: string,
    language: string
  ): Promise<Symbol[]> {
    // Language-specific extraction
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.extractJSSymbols(filePath, content);
      case 'python':
        return this.extractPythonSymbols(filePath, content);
      default:
        return [];
    }
  }

  private extractJSSymbols(filePath: string, content: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');

    // Simple regex-based extraction (production would use AST parser)
    const functionRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|=>))/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = functionRegex.exec(line)) !== null) {
        const name = match[1] || match[2];
        if (name) {
          symbols.push({
            name,
            type: 'function',
            filePath,
            line: index + 1
          });
        }
      }
    });

    return symbols;
  }

  private extractPythonSymbols(filePath: string, content: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');

    const functionRegex = /(?:def\s+(\w+)|(?:class\s+(\w+)))/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = functionRegex.exec(line)) !== null) {
        const name = match[1] || match[2];
        const type = match[1] ? 'function' : 'class';
        if (name) {
          symbols.push({
            name,
            type,
            filePath,
            line: index + 1
          });
        }
      }
    });

    return symbols;
  }

  private buildStructure(files: AnalyzedFile[]): DirectoryStructure {
    const root: DirectoryStructure = { name: '/', children: {} };

    files.forEach(file => {
      const parts = file.path.split('/');
      let current = root;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // It's a file
          current.children[part] = { file };
        } else {
          // It's a directory
          if (!current.children[part]) {
            current.children[part] = { name: part, children: {} };
          }
          current = current.children[part] as DirectoryStructure;
        }
      });
    });

    return root;
  }

  private extractImports(files: AnalyzedFile[]): ImportMap {
    const imports: ImportMap = {};

    files.forEach(file => {
      imports[file.path] = file.imports;
    });

    return imports;
  }

  private extractExports(files: AnalyzedFile[]): ExportMap {
    const exports: ExportMap = {};

    files.forEach(file => {
      exports[file.path] = file.exports;
    });

    return exports;
  }
}
```

### 5. Plan Generator

```typescript
// src/core/plan-generator.ts
import { Task } from '../models/task';
import { Plan } from '../models/plan';
import { FileAnalyzer } from './file-analyzer';
import { LLMService } from '../services/llm.service';
import { ContextManager } from './context-manager';

export class PlanGenerator {
  constructor(
    private fileAnalyzer: FileAnalyzer,
    private llmService: LLMService,
    private contextManager: ContextManager
  ) {}

  async generate(task: Task): Promise<Plan> {
    // Step 1: Analyze codebase
    const codebase = await this.fileAnalyzer.analyze(task.context);

    // Step 2: Gather context
    const context = await this.contextManager.gather(codebase, task);

    // Step 3: Build prompt
    const prompt = this.buildPrompt(task, code)base, context);

    // Step 4: Call LLM
    const response = await this.llmService.complete(prompt, {
      model: 'claude-3-5-sonnet-20241022',
      system: this.getSystemPrompt(),
      maxTokens: 8192
    });

    // Step 5: Parse plan
    const plan = this.parsePlan(response.content, task);

    return plan;
  }

  private buildPrompt(
    task: Task,
    codebase: Codebase,
    context: ProjectContext
  ): string {
    let prompt = `# Task\n${task.query}\n\n`;

    // Add project context
    if (context.summary) {
      prompt += `# Project Context\n${context.summary}\n\n`;
    }

    // Add relevant files
    const relevantFiles = this.getRelevantFiles(codebase, task.query);
    prompt += `# Relevant Files\n`;
    relevantFiles.forEach(file => {
      prompt += `## ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`;
    });

    // Add AGENTS.md
    if (context.agentsMd) {
      prompt += `# Project Instructions (AGENTS.md)\n${context.agentsMd}\n\n`;
    }

    prompt += `# Instructions\n`;
    prompt += `Generate a detailed implementation plan that includes:\n`;
    prompt += `1. Clear step-by-steps with file references\n`;
    prompt += `2. Specific function/class names and locations\n`;
    prompt += `3. Code snippets where helpful\n`;
    prompt += `4. Rationale for each decision\n`;
    prompt += `5. Potential edge cases and constraints\n\n`;
    prompt += `Format your response as a structured markdown document.`;

    return prompt;
  }

  private getSystemPrompt(): string {
    return `You are an expert software architect and developer. Your task is to generate detailed, actionable implementation plans that AI coding agents can follow precisely.

Key principles:
- Be specific and concrete in your instructions
- Provide exact file paths and function names
- Include code snippets where they clarify the implementation
- Explain the "why" behind your decisions
- Consider existing code patterns and project conventions
- Identify potential risks, dependencies, and edge cases

Output format:
1. Start with a high-level summary of the approach
2. Provide numbered implementation steps
3. For each step, include:
   - Clear description of what to do
   - Which files to modify/create
   - Specific code changes (with snippets)
   - Any new symbols to add
   - Rationale for the approach
4. End with a summary of expected outcomes`;
  }

  private getRelevantFiles(codebase: Codebase, query: string): AnalyzedFile[] {
    // Simple relevance scoring (production would use embeddings)
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(word => word.length > 3);

    return codebase.files
      .map(file => ({
        file,
        score: this.calculateRelevanceScore(file, keywords)
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // Top 10 most relevant files
      .map(({ file }) => file);
  }

  private calculateRelevanceScore(file: AnalyzedFile, keywords: string[]): number {
    let score = 0;
    const contentLower = file.content.toLowerCase();

    keywords.forEach(keyword => {
      // Check filename
      if (file.path.toLowerCase().includes(keyword)) {
        score += 10;
      }

      // Check content
      const occurrences = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
      score += occurrences;
    });

    return score;
  }

  private parsePlan(content: string, task: Task): Plan {
    // Parse markdown-based plan (production would use more robust parser)
    const steps: PlanStep[] = [];
    const lines = content.split('\n');
    let currentStep: Partial<PlanStep> | null = null;
    let stepId = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect step headers (## or ###)
      if (line.match(/^#{2,3}\s+\d+\./)) {
        if (currentStep && currentStep.title && currentStep.description) {
          steps.push({
          ...currentStep,
          id: `step_${stepId++}`
          });
        }

        const title = line.replace(/^#{2,3}\s+\d+\.\s*/, '').trim();
        currentStep = { title, description: '', files: [] };
      } else if (currentStep) {
        // Accumulate description
        if (line.trim() && !line.startsWith('#')) {
          if (currentStep.description) {
            currentStep.description += '\n';
          }
          currentStep.description += line;

          // Extract file references
          const fileMatches = line.match(/`[^`]+\.(\w+)`/g);
          if (fileMatches) {
            fileMatches.forEach(match => {
              const filePath = match.replace(/`/g, '');
              if (!currentStep!.files.includes(filePath)) {
                currentStep!.files.push(filePath);
              }
            });
          }
        }
      }
    }

    // Add last step
    if (currentStep && currentStep.title && currentStep.description) {
      steps.push({
        ...currentStep,
        id: `step_${stepId}`
      });
    }

    return {
      id: `plan_${Date.now()}`,
      taskId: task.id,
      query: task.query,
      steps,
      rationale: this.extractRationale(content),
      createdAt: new Date(),
      iterations: []
    };
  }

  private extractRationale(content: string): string {
    // Extract rationale section if present
    const rationaleMatch = content.match(/# Rationale\s*\n([\s\S]*?)(?=\n#|$)/);
    return rationaleMatch ? rationaleMatch[1].trim() : '';
  }
}
```

### 6. Verifier

```typescript
// src/core/verifier.ts
import { Task, Plan, Verification, VerificationComment } from '../models';
import { FileAnalyzer } from './file-analyzer';
import { LLMService } from '../services/llm.service';

export class Verifier {
  constructor(
    private fileAnalyzer: FileAnalyzer,
    private llmService: LLMService
  ) {}

  async verify(task: Task): Promise<Verification> {
    if (!task.plan) {
      throw new Error('Task has no plan to verify against');
    }

    // Step 1: Analyze current codebase
    const currentCodebase = await this.fileAnalyzer.analyze(task.context);

    // Step 2: Compare implementation
    const comparison = this.compareImplementation(task.plan, currentCodebase);

    // Step 3: Generate verification comments
    const prompt = this.buildVerificationPrompt(task.plan, comparison);
    const response = await this.llmService.complete(prompt, {
      model: 'claude-3-5-sonnet-20241022',
      system: this.getVerificationSystemPrompt(),
      maxTokens: 4096
    });

    // Step 4: Parse comments
    const comments = this.parseVerificationComments(response.content);

    return {
      id: `verification_${Date.now()}`,
      taskId: task.id,
      timestamp: new Date(),
      comments,
      summary: this.generateSummary(comments)
    };
  }

  private compareImplementation(plan: Plan, codebase: Codebase): ImplementationComparison {
    // Check if plan files are present
    const planFiles = plan.steps.flatMap(step => step.files);
    const existingFiles = codebase.files.map(f => f.path);

    return {
      filesPresent: planFiles.filter(f => existingFiles.includes(f)),
      filesMissing: planFiles.filter(f => !existingFiles.includes(f)),
      filesCreated: existingFiles() => !planFiles.includes(f)),
      codebaseSize: codebase.files.reduce((sum, f) => sum + f.size, 0),
      symbolCount: codebase.files.reduce((sum, f) => sum + f.symbols.length, 0)
    };
  }

  private buildVerificationPrompt(
    plan: Plan,
    comparison: ImplementationComparison
  ): string {
    let prompt = `# Verification Task\n\n`;
    prompt += `Verify that the implementation matches the plan.\n\n`;

    prompt += `# Plan Summary\n`;
    prompt += `${plan.rationale}\n\n`;

    prompt += `# Plan Steps\n`;
    plan.steps.forEach((step, index) => {
      prompt += `## Step ${index + 1}: ${step.title}\n`;
      prompt += `${step.description}\n`;
      if (step.files.length > 0) {
        prompt += `Files: ${step.files.join(', ')}\n`;
      }
      prompt += `\n`;
    });

    prompt += `# Implementation Status\n`;
    prompt += `- Plan files present: ${comparison.filesPresent.length}\n`;
    prompt += `- Plan files missing: ${comparison.filesMissing.length}\n`;
    prompt += `- Additional files created: ${comparison.filesCreated.length}\n\n`;

    if (comparison.filesMissing.length > 0) {
      prompt += `# Missing Files\n`;
      comparison.filesMissing.forEach(file => {
        prompt += `- ${file}\n`;
      });
      prompt += `\n`;
    }

    prompt += `# Instructions\n`;
    prompt += `Generate verification comments for any issues found.\n`;
    prompt += `Categorize each comment as:\n`;
    prompt += `- **critical**: Blocks core functionality or plan requirements\n`;
    prompt += `- **major**: Significant issues affecting behavior/UX\n`;
    prompt += `- **minor**: Small polish items\n`;
    prompt += `- **outdated**: No longer relevant\n\n`;
    prompt += `For each comment, provide:\n`;
    prompt += `1. Severity level\n`;
    prompt += `2. File path and line number (if applicable)\n`;
    prompt += `3. Clear description of the issue\n`;
    prompt += `4. Suggested fix (if applicable)\n\n`;
    prompt += `Format as a markdown list with clear categorization.`;

    return prompt;
  }

  private getVerificationSystemPrompt(): string {
    return `You are a code verification expert. Your task is to verify that an implementation matches a plan and identify any issues or gaps.

Your verification should:
- Be thorough but focused on real issues
- Clearly distinguish between critical, major, and minor problems
- Provide actionable suggestions for fixes
- Consider both plan adherence and code quality
- Flag missing implementations or deviations from the plan

Comment format:
\`\`\`
[SEVERITY]
File: path/to/file.ts:Line
Issue: Clear description
Suggestion: How to fix it
\`\`\`

Priorities:
1. Verify all plan requirements are implemented
2. Check for functional correctness
3. Identify security or performance concerns
4. Note code quality and maintainability issues`;
  }

  private parseVerificationComments(content: string): VerificationComment[] {
    const comments: VerificationComment[] = [];
    const lines = content.split('\n');
    let currentComment: Partial<VerificationComment> | null = null;
    let commentId = 0;

    for (const line of lines) {
      const severityMatch = line.match(/^\*\*(critical|major|minor|outdated)\*\*/i);
      if (severityMatch) {
        if (currentComment && currentComment.message) {
          comments.push({
            ...currentComment,
            id: `comment_${commentId++}`
          });
        }

        currentComment = {
          severity: severityMatch[1].toLowerCase() as VerificationComment['severity'],
          status: 'open'
        };
      } else if (line.toLowerCase().startsWith('file:')) {
        if (currentComment) {
          const fileMatch = line.match(/File:\s*([^:]+):(\d+)/);
          if (fileMatch) {
            currentComment.file = fileMatch[1].trim();
            currentComment.line = parseInt(fileMatch[2], 10);
          }
        }
      } else if (line.toLowerCase().startsWith('issue:')) {
        if (currentComment) {
          currentComment.message = line.replace(/Issue:\s*/i, '').trim();
        }
      } else if (line.toLowerCase().startsWith('suggestion:')) {
        if (currentComment) {
          currentComment.suggestion = line.replace(/Suggestion:\s*/i, '').trim();
        }
      }
    }

    // Add last comment
    if (currentComment && currentComment.message) {
      comments.push({
        ...currentComment,
        id: `comment_${commentId}`
      });
    }

    return comments;
  }

  private generateSummary(comments: VerificationComment[]): string {
    const critical = comments.filter(c => c.severity === 'critical').length;
    const major = comments.filter(c => c.severity === 'major').length;
    const minor = comments.filter(c => c.severity === 'minor').length;

    return `Found ${comments.length} issues: ${critical} critical, ${major} major, ${minor} minor.`;
  }
}
```

### 7. Agent Service

```typescript
// src/services/agent.service.ts
import { spawn, ChildProcess } from 'child_process';
import { Task, Execution } from '../models';
import { TemplateEngine } from '../core/template-engine';

export class AgentService {
  constructor(
    private templateEngine: TemplateEngine
  ) {}

  async execute(task: Task, agentConfig: AgentConfig): Promise<Execution> {
    // Step 1: Generate prompt
    const prompt = await this.templateEngine.renderPlanTemplate(
      task.plan!,
      {
        taskId: task.id,
        timestamp: new Date().toISOString()
      }
    );

    // Step 2: Prepare environment variables
    const env = {
      ...process.env,
      TRAYCER_PROMPT: prompt,
      TRAYCER_PROMPT_TMP_FILE: await this.writeTempFile(prompt),
      TRAYCER_TASK_ID: task.id,
      TRAYCER_SYSTEM_PROMPT: agentConfig.systemPrompt || ''
    };

    // Step 3: Execute agent
    const startTime = Date.now();
    const { stdout, stderr, exitCode } = await this.spawnAgent(
      agentConfig.command,
      agentConfig.args,
      env
    );
    const duration = Date.now() - startTime;

    return {
      id: `execution_${Date.now()}`,
      taskId: task.id,
      timestamp: new Date(),
      agentId: agentConfig.id,
      status: exitCode === 0 ? 'success' : 'failed',
      stdout,
      stderr,
      duration
    };
  }

  private async writeTempFile(content: string): Promise<string> {
    const tmpDir = process.env.TMPDIR || '/tmp';
    const filePath = path.join(tmpDir, `sdd_prompt_${Date.now()}.txt`);

    await fs.writeFile(filePath, content, 'utf-8');

    // Schedule cleanup
    setTimeout(() => {
      fs.unlink(filePath).catch(() => {});
    }, 30000);

    return filePath;
  }

  private spawnAgent(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }
}
```

---

## Integration Implementation

### 1. Git Integration

```typescript
// src/integrations/git/index.ts
import simpleGit, { SimpleGit } from 'simple-git';

export class GitService {
  private git: SimpleGit;

  constructor(workingDir?: string) {
    this.git = simpleGit(workingDir || process.cwd());
  }

  async isRepository(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async getDiff(ref: string = 'HEAD'): Promise<GitDiff[]> {
    const diff = await this.git.diff([ref]);
    return this.parseDiff(diff);
  }

  async getCurrentBranch(): Promise<string> {
    const { current } = await this.git.branch();
    return current;
  }

  async commit(message: string, files?: string[]): Promise<void> {
    if (files && files.length > 0) {
      await this.git.add(files);
    } else {
      await this.git.add('.');
    }

    await this.git.commit(message);
  }

  private parseDiff(diffText: string): GitDiff[] {
    // Parse git diff output
    const diffs: GitDiff[] = [];
    const lines = diffText.split('\n');
    let currentDiff: Partial<GitDiff> | null = null;

    for (const line of lines) {
      const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (fileMatch) {
        if (currentDiff && currentDiff.filePath) {
          diffs.push(currentDiff as GitDiff);
        }

        currentDiff = {
          filePath: fileMatch[2],
          additions: 0,
          deletions: 0,
          changes: []
        };
      } else if (currentDiff && line.startsWith('+')) {
        if (!line.startsWith('++')) {
) => currentDiff.additions++;
          currentDiff.changes.push({ type: 'addition', content: line.substring(1) });
        }
      } else if (currentDiff && line.startsWith('-')) {
        if (!line.startsWith('--')) {
          currentDiff.deletions++;
          currentDiff.changes.push({ type: 'deletion', content: line.substring(1) });
        }
      }
    }

    // Add last diff
    if (currentDiff && currentDiff.filePath) {
      diffs.push(currentDiff as GitDiff);
    }

    return diffs;
  }
}
```

### 2. Context Manager

```typescript
// src/core/context-manager.ts
import fs from 'fs/promises';
import path from 'path';

export class ContextManager {
  async gather(codebase: Codebase, task: Task): Promise<ProjectContext> {
    const context: ProjectContext = {
      workingDir: task.context.workingDir,
      summary: await this.generateSummary(codebase),
      agentsMd: await this.findAgentsMd(task.context.workingDir),
      config: await this.loadProjectConfig(task.context.workingDir),
      packageJson: await this.loadPackageJson(task.context.workingDir)
    };

    return context;
  }

  private async generateSummary(codebase: Codebase): Promise<string> {
    const fileCount = codebase.files.length;
    const languages = new Set(codebase.files.map(f => f.language));
    const totalLines = codebase.files.reduce((sum, f) => sum + f.lines, 0);

    return `Project contains ${fileCount} files across ${languages.size} languages (${Array.from(languages).join(', ')}). Total: ${totalLines} lines of code.`;
  }

  private async findAgentsMd(workingDir: string): Promise<string | null> {
    let currentDir = workingDir;
    const rootPath = path.parse(workingDir).root;

    while (currentDir !== rootPath) {
      const agentsMdPath = path.join(currentDir, 'AGENTS.md');

      try {
        const content = await fs.readFile(agentsMdPath, 'utf-8');
        return content;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Move up one directory
      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  private async loadProjectConfig(workingDir: string): Promise<any> {
    const configPath = path.join(workingDir, '.sdd-tool', 'config.yaml');

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return yaml.parse(content);
    } catch {
      return null;
    }
  }

  private async loadPackageJson(workingDir: string): Promise<any> {
    const packageJsonPath = path.join(workingDir, 'package.json');

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/unit/plan-generator.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanGenerator } from '../../src/core/plan-generator';
import { mock } from 'vitest-mock-extended';

describe('PlanGenerator', () => {
  let planGenerator: PlanGenerator;
  let mockFileAnalyzer = mock<FileAnalyzer>();
  let mockLLMService = mock<LLMService>();
  let mockContextManager = mock<ContextManager>();

  beforeEach(() => {
    planGenerator = new PlanGenerator(
      mockFileAnalyzer,
      mockLLMService,
      mockContextManager
    );
  });

  it('should generate a plan', async () => {
    const task = {
      id: 'task_1',
      type: 'plan' as const,
      query: 'Add user authentication',
      status: 'pending' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      context: { workingDir: '/test' }
    };

    mockLLMService.complete.mockResolvedValue({
      content: `# Plan
## Step 1: Create user model
Create a User class with id, email, and password fields.

## Step 2: Add authentication endpoints
Implement login and registration API endpoints.`,
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 }
    });

    const plan = await planGenerator.generate(task);

    expect(plan.taskId).toBe(task.id);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].title).toBe('Create user model');
  });

  it('should handle LLM errors gracefully', async () => {
    const task = {
      id: 'task_1',
      type: 'plan' as const,
      query: 'Add feature',
      status: 'pending' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      context: { workingDir: '/test' }
    };

    mockLLMService.complete.mockRejectedValue(new Error('API error'));

    await expect(planGenerator.generate(task)).rejects.toThrow('API error');
  });
});
```

### Integration Tests

```typescript
// tests/integration/task-execution.test.ts
import { describe, it, expect } from 'vitest';
import { TaskEngine } from '../../src/core/task-engine';
import { FileStorage } from '../../src/data/storage/file-storage';

describe('Task Execution Integration', () => {
  it('should complete full task lifecycle', async () => {
    const storage = new FileStorage('/tmp/sdd-test');
    const engine = new TaskEngine(storage);

    // Create task
    const task = await engine.createTask('Add feature', 'plan', {
      workingDir: process.cwd()
    });

    // Generate plan
    const plan = await engine.generatePlan(task.id);

    // Execute with mock agent
    const execution = await engine.execute(task.id, {
      agentId: 'test-agent',
      autoApprove: true
    });

    // Verify
    const verification = await engine.verify(task.id);

    expect(task.status).toBe('completed');
    expect(execution.status).toBe('success');
    expect(verification.comments.length).toBeGreaterThanOrEqual(0);
  });
});
```

---

## Build & Release

### Build Package

```bash
# Build TypeScript
pnpm build

# Test build
node dist/index.js hello
```

### Release Process

```bash
# Update version
pnpm version patch

# Generate changelog
# (Manual or automated)

# Build and publish
pnpm build
npm publish
```

---

## Future Enhancements

### 1. YOLO Mode (Automation)

```typescript
// src/core/yolo-engine.ts
export class YOLOEngine {
  async execute(task: Task, config: YOLOConfig): Promise<YOLOResult> {
    const results: YOLOResult = {
      task: task,
      phases: [],
      totalTime: 0
    };

    // Generate plan
    const startTime = Date.now();
    const plan = await this.planGenerator.generate(task);
    results.phases.push({
      type: 'planning',
      duration: Date.now() - startTime
    });

    // Execute with agent
    startTime = Date.now();
    const execution = await this.agentService.execute(task, config.agent);
    results.phases.push({
      type: 'execution',
      duration: Date.now() - startTime
    });

    // Verify
    if (config.verify) {
      startTime = Date.now();
      const verification = await this.verifier.verify(task);
      results.phases.push({
        type: 'verification',
        duration: Date.now() - startTime
      });

      // Auto-fix if configured
      if (config.autoFix && verification.comments.length > 0) {
        await this.autoFix(task, verification);
      }
    }

    results.totalTime = results.phases.reduce((sum, p) => sum + p.duration, 0);
    return results;
  }
}
```

### 2. MCP Integration

```typescript
// src/integrations/mcp/client.ts
export class MCPClient {
  async connect(serverUrl: string): Promise<void> {
    // Connect to MCP server
  }

  async listTools(): Promise<MCPTool[]> {
    // List available tools
  }

  async callTool(name: string, args: {any): Promise<any> {
    // Call MCP tool
  }
}
```

### 3. VS Code Extension

```typescript
// extension/src/extension.ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'sdd.createPlan',
    async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Enter task description'
      });

      if (query) {
        // Call SDD tool via child process
        const sdd = spawn('sdd', ['plan', query]);
        // ... handle output
      }
    }
  );

  context.subscriptions.push(disposable);
}
```

---

## Best Practices

1. **Error Handling**: Always provide clear, actionable error messages
2. **Logging**: Use structured logging with appropriate log levels
3. **Testing**: Maintain >80% code coverage
4. **Documentation**: Keep README and inline docs up to date
5. **Type Safety**: Leverage TypeScript for type safety
6. **Performance**: Use async/await and avoid blocking operations
7. **Security**: Never log or expose API keys or sensitive data
8. **User Experience**: Provide progress indicators for long operations
9. **Backwards Compatibility**: Support old configurations during migrations
10. **Open Source**: Follow contribution guidelines and maintain code of conduct

---

This implementation guide provides a comprehensive roadmap for building a personal Spec-Driven Development tool. Start with the MVP features and iterate based on user feedback.
