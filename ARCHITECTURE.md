# Personal Spec-Driven Development Tool - Technical Architecture

## Architecture Overview

The Personal SDD Tool is designed as a **modular, extensible CLI application** with a focus on local-first data management and seamless AI agent integration.

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   CLI Shell  │  │   TUI Mode   │  │ IDE Extension │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                         Command Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Commands   │  │   Arg Parsers│  │   Validators │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                         Service Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Task Service │  │ Plan Service │  │ Verify Svc   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Agent Service │  │  LLM Service │  │  Git Service │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                         Core Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Task Engine │  │Plan Generator│  │  Verifier    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │File Analyzer │  │  Context Mgr │  │  Template Eng│        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Data Access Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Storage    │  │   Repository │  │    Cache     │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Infrastructure Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ File System  │  │  Git Integration│ │  LLM APIs   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Technology Stack

### 1.1 Core Technologies
- **Runtime**: Node.js 18+ LTS
- **Language**: TypeScript 5.0+
- **Package Manager**: pnpm (preferred) or npm
- **CLI Framework**: Commander.js or Yargs
- **TUI Framework**: Ink or Blessed (for terminal UI)
- **Build Tool**: tsup or esbuild

### 1.2 Key Dependencies
```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "chalk": "^5.0.0",
    "ora": "^6.0.0",
    "inquirer": "^9.0.0",
    "handlebars": "^4.7.8",
    "zod": "^3.22.0",
    "openai": "^4.0.0",
    "@anthropic-ai/sdk": "^0.20.0",
    "simple-git": "^3.20.0",
    "glob": "^10.0.0",
    "ignore": "^5.2.0",
    "mermaid": "^10.0.0",
    "diff": "^5.0.0",
    "yaml": "^2.3.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0",
    "tsx": "^4.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

### 1.3 Optional Dependencies (for advanced features)
```json
{
  "optionalDependencies": {
    "ink": "^4.0.0",
    "blessed": "^0.1.81",
    "sqlite3": "^5.1.0",
    "better-sqlite3": "^9.0.0"
  }
}
```

---

## 2. System Architecture

### 2.1 Layer Architecture

#### User Interface Layer
```typescript
// src/ui/cli.ts
interface CLIInterface {
  parseArgs(args: string[]): ParsedCommand;
  executeCommand(command: ParsedCommand): Promise<void>;
  displayOutput(output: Displayable): void;
  handleError(error: Error): void;
}

// src/ui/tui.ts
interface TUIInterface {
  renderDashboard(): void;
  renderTaskList(tasks: Task[]): void;
  renderPlanEditor(plan: Plan): void;
  renderVerificationResults(results: Verification): void;
}
```

#### Command Layer
```typescript
// src/commands/index.ts
interface Command {
  name: string;
  description: string;
  options: CommandOption[];
  handler: (args: ParsedArgs) => Promise<void>;
}

// src/commands/plan.ts
export const planCommand: Command = {
  name: 'plan',
  description: 'Create a new plan task',
  options: [
    { name: 'query', required: true, description: 'Task description' },
    { name: 'files', alias: 'f', description: 'Files to include' },
    { name: 'output', alias: 'o', description: 'Output format' }
  ],
  handler: handlePlanCommand
};
```

#### Service Layer
```typescript
// src/services/task.service.ts
export class TaskService {
  constructor(
    private taskRepository: TaskRepository,
    private planGenerator: PlanGenerator
  ) {}

  async createPlanTask(query: string, context: TaskContext): Promise<Task> {
    const task = await this.planGenerator.generatePlan(query, context);
    await this.taskRepository.save(task);
    return task;
  }

  async executeTask(taskId: string, agent: Agent): Promise<Execution> {
    const task = await this.taskRepository.findById(taskId);
    const execution = await agent.execute(task);
    await this.taskRepository.addExecution(taskId, execution);
    return execution;
  }
}
```

#### Core Layer
```typescript
// src/core/task-engine.ts
export class TaskEngine {
  private state: TaskState;

  async processTask(task: Task, mode: TaskMode): Promise<TaskResult> {
    switch (mode) {
      case 'plan':
        return this.processPlanMode(task);
      case 'phases':
        return this.processPhasesMode(task);
      case 'review':
        return this.processReviewMode(task);
      case 'epic':
        return this.processEpicMode(task);
    }
  }
}
```

#### Data Access Layer
```typescript
// src/data/storage.ts
export interface Storage {
  save<T>(key: string, value: T): Promise<void>;
  load<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// src/data/file-storage.ts
export class FileStorage implements Storage {
  constructor(private basePath: string) {}

  async save<T>(key: string, value: T): Promise<void> {
    const path = `${this basePath}/${key}.json`;
    await fs.writeFile(path, JSON.stringify(value, null, 2));
  }
}
```

### 2.2 Module Structure

```
src/
├── bin/                          # Entry points
│   └── sdd.ts                    # Main CLI entry point
├── ui/                           # User interfaces
│   ├── cli/                      # CLI interface
│   │   ├── parser.ts
│   │   ├── formatter.ts
│   │   └── progress.ts
│   ├── tui/                      # Terminal UI (optional)
│   │   ├── dashboard.ts
│   │   ├── editor.ts
│   │   └── components/
│   └── ide/                      # IDE extension interface
│       └── api.ts
├── commands/                     # CLI commands
│   ├── plan.ts
│   ├── phases.ts
│   ├── review.ts
│   ├── epic.ts
│   ├── exec.ts
│   ├── verify.ts
│   ├── history.ts
│   ├── config.ts
│   ├── agent.ts
│   ├── template.ts
│   └── workflow.ts
├── services/                     # Business logic services
│   ├── task.service.ts
│   ├── plan.service.ts
│   ├── verification.service.ts
│   ├── agent.service.ts
│   ├── llm.service.ts
│   ├── git.service.ts
│   └── context.service.ts
├── core/                         # Core business logic
│   ├── task-engine.ts
│   ├── plan-generator.ts
│   ├── verifier.ts
│   ├── file-analyzer.ts
│   ├── context-manager.ts
│   ├── template-engine.ts
│   └── workflow-engine.ts
├── data/                         # Data access
│   ├── repositories/
│   │   ├── task.repository.ts
│   │   ├── plan.repository.ts
│   │   └── execution.repository.ts
│   ├── storage/
│   │   ├── file-storage.ts
│   │   ├── sqlite-storage.ts
│   │   └── memory-storage.ts
│   └── migrations/
│       └── 001_initial.ts
├── integrations/                 # External integrations
│   ├── llm/
│   │   ├── base.ts
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   └── ollama.ts
│   ├── agents/
│   │   ├── base.ts
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   └── custom.ts
│   ├── git/
│   │   ├── index.ts
│   │   └── operations.ts
│   ├── mcp/
│   │   ├── client.ts
│   │   └── tools.ts
│   └── code-analysis/
│       ├── eslint.ts
│       ├── typescript.ts
│       └── python.ts
├── models/                       # Data models
│   ├── task.ts
│   ├── plan.ts
│   ├── phase.ts
│   ├── verification.ts
│   ├── epic.ts
│   └── workflow.ts
├── config/                       # Configuration
│   ├── schema.ts
│   ├── loader.ts
│   └── defaults.ts
├── utils/                        # Utilities
│   ├── logger.ts
│   ├── errors.ts
│   ├── format.ts
│   ├── validation.ts
│   └── helpers.ts
├── templates/                    # Built-in templates
│   ├── plan.hbs
│   ├── verification.hbs
│   └── review.hbs
└── index.ts                      # Main exports
```

---

## 3. Core Component Architecture

### 3.1 Task Engine

The Task Engine is the central orchestrator that manages the entire task lifecycle.

```typescript
// src/core/task-engine.ts
export class TaskEngine {
  private state: Map<string, TaskState>;
  private eventEmitter: EventEmitter;

  constructor(
    private taskService: TaskService,
    private planGenerator: PlanGenerator,
    private verifier: Verifier,
    private agentService: AgentService
  ) {}

  async createTask(
    query: string,
    mode: TaskMode,
    context: TaskContext
  ): Promise<Task> {
    const task = new Task({
      id: generateId(),
      type: mode,
      query,
      status: 'pending',
      createdAt: new Date(),
      context
    });

    await this.taskService.save(task);
    this.emit('task:created', task);
    return task;
  }

  async executeTask(
    taskId: string,
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    const task = await this.taskService.findById(taskId);
    const state = this.getState(taskId);

    // Generate plan if needed
    if (!task.plan && options.generatePlan) {
      task.plan = await this.planGenerator.generate(task);
      await this.taskService.update(task);
    }

    // Execute with agent
    const agent = await this.agentService.getAgent(options.agentId);
    const execution = await agent.execute(task);

    // Verify if requested
    if (options.verify) {
      const verification = await this.verifier.verify(task, execution);
      execution.verification = verification;
    }

    await this.taskService.addExecution(taskId, execution);
    return execution;
  }

  private getState(taskId: string): TaskState {
    if (!this.state.has(taskId)) {
      this.state.set(taskId, new TaskState());
    }
    return this.state.get(taskId)!;
  }
}
```

### 3.2 Plan Generator

The Plan Generator analyzes the codebase and generates detailed implementation plans.

```typescript
// src/core/plan-generator.ts
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

    // Step 3: Generate plan using LLM
    const prompt = this.buildPrompt(task.query, codebase, context);
    const response = await this.llmService.complete(prompt, {
      model: 'claude-3-5-sonnet',
      system: this.getSystemPrompt()
    });

    // Step 4: Parse and validate plan
    const plan = this.parsePlan(response.content);
    await this.validatePlan(plan, codebase);

    return plan;
  }

  private buildPrompt(
    query: string,
    codebase: Codebase,
    context: ProjectContext
  ): string {
    return `
# Task: ${query}

# Project Context
${context.summary}

# Relevant Files
${codebase.files.map(f => `- ${f.path}: ${f.purpose}`).join('\n')}

' AGENTS.md Instructions
${context.agentsMd || 'None found'}

# Instructions
Generate a detailed implementation plan that:
1. Identifies which files need to be modified/created
2. Provides step-by-step implementation instructions
3. Includes symbol references (functions, classes, types)
4. Explains the rationale for each step
5. Identifies potential edge cases and constraints

Format your response as a structured plan with clear sections.
`;
  }

  private getSystemPrompt(): string {
    return `You are an expert software architect and developer. Your task is to generate detailed, actionable implementation plans that AI coding agents can follow precisely.

Key principles:
- Be specific and concrete
- Provide exact file paths and function names
- Include code snippets where helpful
- Explain the "why" behind decisions
- Consider existing code patterns and conventions
- Identify potential risks and dependencies`;
  }
}
```

### 3.3 Verifier

The Verifier compares implementation against the original plan.

```typescript
// src/core/verifier.ts
export class Verifier {
  constructor(
    private fileAnalyzer: FileAnalyzer,
    private llmService: LLMService
  ) {}

  async verify(task: Task, execution: Execution): Promise<Verification> {
    // Step 1: Analyze current codebase
    const currentCodebase = await this.fileAnalyzer.analyze(task.context);

    // Step 2: Get original plan codebase (if available)
    const originalCodebase = execution.originalCodebase || currentCodebase;

    // Step 3: Compare implementation against plan
    const comparison = this.compareImplementation(
      task.plan!,
      currentCodebase,
      originalCodebase
    );

    // Step 4: Generate verification comments using LLM
    const prompt = this.buildVerificationPrompt(
      task.plan!,
      comparison,
      task.query
    );

    const response = await this.llmService.complete(prompt, {
      model: 'claude-3-5-sonnet',
      system: this.getVerificationSystemPrompt()
    });

    // Step 5: Parse and categorize comments
    const comments = this.parseVerificationComments(response.content);
    const categorizedComments = this.categorizeComments(comments);

    return new Verification({
      id: generateId(),
      taskId: task.id,
      timestamp: new Date(),
      comments: categorizedComments,
      summary: this.generateSummary(categorizedComments)
    });
  }

  private compareImplementation(
    plan: Plan,
    current: Codebase,
    original: Codebase
  ): ImplementationComparison {
    return {
      filesModified: this.getModifiedFiles(original, current),
      filesCreated: this.getCreatedFiles(original, current),
      filesDeleted: this.getDeletedFiles(original, current),
      planCompleteness: this.assessPlanCompleteness(plan, current),
      deviations: this.identifyDeviations(plan, current)
    };
  }

  private categorizeComments(
    comments: VerificationComment[]
  ): CategorizedComments {
    return {
      critical: comments.filter(c => c.severity === 'critical'),
      major: comments.filter(c => c.severity === 'major'),
      minor: comments.filter(c => c.severity === 'minor'),
      outdated: comments.filter(c => c.status === 'outdated')
    };
  }
}
```

### 3.4 File Analyzer

The File Analyzer provides codebase analysis capabilities.

```typescript
// src/core/file-analyzer.ts
export class FileAnalyzer {
  private supportedExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs'];

  async analyze(context: TaskContext): Promise<Codebase> {
    const files = await this.scanFiles(context);
    const analyzedFiles = await Promise.all(
      files.map(file => this.analyzeFile(file))
    );

    return new Codebase({
      files: analyzedFiles,
      structure: this.buildStructure(analyzedFiles),
      imports: this.extractImports(analyzedFiles),
      exports: this.extractExports(analyzedFiles),
      types: this.extractTypes(analyzedFiles)
    });
  }

  private async scanFiles(context: TaskContext): Promise<string[]> {
    const patterns = context.files || ['**/*'];
    const files: string[] = [];

    for (const pattern of patterns) {
      const matched = await glob(pattern, {
        cwd: context.workingDir,
        ignore: this.getGitignore(context.workingDir)
      });
      files.push(...matched.filter(f =>
        this.supportedExtensions.some(ext => f.endsWith(ext))
      ));
    }

    return [...new Set(files)]; // Deduplicate
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
      imports: await this.extractImports(filePath, content, language),
      dependencies: await this.extractDependencies(content, language),
      complexity: this.calculateComplexity(content)
    };
  }

  private async extractSymbols(
    filePath: string,
    content: string,
    language: string
  ): Promise<Symbol[]> {
    // Language-specific symbol extraction
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.extractJSSymbols(content, filePath);
      case 'python':
        return this.extractPythonSymbols(content, filePath);
      case 'go':
        return this.extractGoSymbols(content, filePath);
      default:
        return [];
    }
  }
}
```

### 3.5 Template Engine

The Template Engine handles prompt templating for agents.

```typescript
// src/core/template-engine.ts
export class TemplateEngine {
  private handlebars: Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  async renderTemplate(
    templatePath: {string},
    data: TemplateData
  ): Promise<string> {
    const template = await this.loadTemplate(templatePath);
    return this.handlebars.compile(template)(data);
  }

  async renderPlanTemplate(plan: Plan, options: RenderOptions): Promise<string> {
    const template = options.customTemplate ||
                     await this.getDefaultTemplate('plan');

    const data = {
      planMarkdown: this.formatPlan(plan),
      taskId: plan.taskId,
      timestamp: new Date().toISOString(),
      ...options.additionalData
    };

    return this.handlebars.compile(template)(data);
  }

  async renderVerificationTemplate(
    comments: VerificationComment[],
    options: RenderOptions
  ): Promise<string> {
    const template = options.customTemplate ||
                     await this.getDefaultTemplate('verification');

    const data = {
      comments: this.formatComments(comments),
      criticalCount: comments.filter(c => c.severity === 'critical').length,
      majorCount: comments.filter(c => c.severity === 'major').length,
      minorCount: comments.filter(c => c.severity === 'minor').length,
      ...options.additionalData
    };

    return this.handlebars.compile(template)(data);
  }

  private registerHelpers(): void {
    // Register custom Handlebars helpers
    this.handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
    this.handlebars.registerHelper('uppercase', (str) => str.toUpperCase());
    this.handlebars.registerHelper('lowercase', (str) => str.toLowerCase());
  }

  private formatPlan(plan: Plan): string {
    // Format plan as markdown
    let markdown = `# Implementation Plan\n\n`;
    markdown += `## Task: ${plan.taskQuery}\n\n`;
    markdown += `## Rationale\n${plan.rationale}\n\n`;
    markdown += `## Implementation Steps\n\n`;

    plan.steps.forEach((step, index) => {
      markdown += `### Step ${index + 1}: ${step.title}\n\n`;
      markdown += `${step.description}\n\n`;
      if (step.files.length > 0) {
        markdown += `**Files:** ${step.files.join(', ')}\n\n`;
      }
      if (step.codeSnippet) {
        markdown += `\`\`\`${step.language}\n${step.codeSnippet}\n\`\`\`\n\n`;
      }
    });

    return markdown;
  }
}
```

---

## 4. Data Flow

### 4.1 Plan Generation Flow

```
User Input (Query)
    ↓
Task Engine
    ↓
File Analyzer
    ├── Scan files
    ├── Extract symbols
    ├── Build codebase model
    └── Detect language
    ↓
Context Manager
    ├── Find AGENTS.md
    ├── Parse project context
    └── Gather configuration
    ↓
LLM Service
    ├── Build prompt
    ├── Call LLM API
    └── Parse response
    ↓
Plan Parser
    ├── Validate structure
    ├── Extract steps
    └── Build plan object
    ↓
Storage (Save Plan)
    ↓
Display to User
```

### 4.2 Agent Execution Flow

```
User Command (sdd exec <task-id>)
    ↓
Task Engine
    ├── Load task from storage
    └── Load plan
    ↓
Template Engine
    ├── Load plan template
    ├── Render with plan data
    └── Generate agent prompt
    ↓
Agent Service
    ├── Select agent configuration
    ├── Set environment variables
    └── Execute CLI command
    ↓
Agent (Claude Code, Codex, etc.)
)
    ├── Read TRAYCER_PROMPT
    ├── Execute implementation
    └── Return execution status
    ↓
Task Engine
    ├── Create execution record
    └── Save to storage
    ↓
Display Result to User
```

### 4.3 Verification Flow

```
User Command (sdd verify <task-id>)
    ↓
Task Engine
    ├── Load task from storage
    ├── Load plan
    └── Load execution
    ↓
File Analyzer
    ├── Analyze current codebase
    └── Extract file changes
    ↓
Implementation Comparator
    ├── Compare current vs original
    ├── Identify modifications
    └── Assess plan completeness
    ↓
LLM Service
    ├── Build verification prompt
    ├── Call LLM API
    └── Parse verification response
    ↓
Comment Parser
    ├── Extract comments
    ├── Categorize by severity
    └── Build verification object
    ↓
Storage (Save Verification)
    ↓
Display Results to User
    └── Show categorized comments
```

---

## 5. State Management

### 5.1 Task State

```typescript
// src/core/task-state.ts
export class TaskState {
  private currentPhase: number = 0;
  private context: Map<string, any> = new Map();
  private decisions: Decision[] = [];

  advancePhase(): void {
    this.currentPhase++;
  }

  setContext(key: string, value: any): void {
    this.context.set(key, value);
  }

  getContext(key: string): any {
    return this.context.get(key);
  }

  recordDecision(decision: Decision): void {
    this.decisions.push(decision);
  }

  getDecisions(): Decision[] {
    return [...this.decisions];
  }
}
```

### 5.2 Configuration Management

```typescript
// src/config/loader.ts
export class ConfigLoader {
  async loadConfig(): Promise<Config> {
    // Load from multiple sources with precedence
    const defaults = this.loadDefaults();
    const userConfig = await this.loadUserConfig();
    const projectConfig = await this.loadProjectConfig();
    const envConfig = this.loadEnvConfig();

    return this.mergeConfigs(
      defaults,
      userConfig,
      projectConfig,
      envConfig
    );
  }

  private async loadUserConfig(): Promise<Partial<Config>> {
    const path = path.join(os.homedir(), '.sdd-tool', 'config.yaml');
    if (await fs.exists(path)) {
      const content = await fs.readFile(path, 'utf-8');
      return yaml.parse(content);
    }
    return {};
  }

  private async loadProjectConfig(): Promise<Partial<Config>> {
    const path = path.join(process.cwd(), '.sdd-tool', 'config.yaml');
    if (await fs.exists(path)) {
      const content = await fs.readFile(path, 'utf-8');
      return yaml.parse(content);
    }
    return {};
  }

  private loadEnvConfig(): Partial<Config> {
    return {
      llm: {
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY
        },
        openai: {
          apiKey: process.env.OPENAI_API_KEY
        }
      }
    };
  }
}
```

---

## 6. Error Handling

### 6.1 Error Types

```typescript
// src/utils/errors.ts
export class SDDError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SDDError';
  }
}

export class TaskNotFoundError extends SDDError {
  constructor(taskId: string) {
    super(
      `Task not found: ${taskId}`,
      'TASK_NOT_FOUND',
      { taskId }
    );
  }
}

export class PlanGenerationError extends SDDError {
  constructor(taskId: string, cause: Error) {
    super(
      `Failed to generate plan for task: ${taskId}`,
      'PLAN_GENERATION_FAILED',
      { taskId, cause: cause.message }
    );
  }
}

export class AgentExecutionError extends SDDError {
  constructor(taskId: string, agentId: string, cause: Error) {
    super(
      `Agent execution failed for task: ${taskId}`,
      'AGENT_EXECUTION_FAILED',
      { taskId, agentId, cause: cause.message }
    );
  }
}

export class VerificationError extends SDDError {
  constructor(taskId: string, cause: Error) {
    super(
      `Verification failed for task: ${taskId}`,
      'VERIFICATION_FAILED',
      { taskId, cause: cause.message }
    );
  }
}
```

### 6.2 Error Handler

```typescript
// src/utils/errors.ts
export class ErrorHandler {
  handle(error: Error): void {
    if (error instanceof SDDError) {
      this.handleSDDError(error);
    } else {
      this.handleUnknownError(error);
    }
  }

  private handleSDDError(error: SDDError): void {
    console.error(chalk.red(`Error: ${error.message}`));

    if (error.details) {
      console.error(chalk.gray(`Details: ${JSON.stringify(error.details, null, 2)}`));
    }

    // Provide actionable suggestions
    const suggestion = this.getSuggestion(error.code);
    if (suggestion) {
      console.error(chalk.yellow(`Suggestion: ${suggestion}`));
    }
  }

  private getSuggestion(code: string): string | undefined {
    const suggestions: Record<string, string> = {
      TASK_NOT_FOUND: 'Use "sdd history" to list all tasks',
      PLAN_GENERATION_FAILED: 'Check your LLM API key and try again',
      AGENT_EXECUTION_FAILED: 'Ensure the agent is installed and configured',
      VERIFICATION_FAILED: 'Review the code changes and try re-verifying'
    };

    return suggestions[code];
  }
}
```

---

## 7. Performance Optimization

### 7.1 Caching Strategy

```typescript
// src/data/cache.ts
export class Cache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number = 5 * 60 * 1000; // 5 minutes default

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.ttl
    });
  }

  async invalidate(pattern: string): Promise<void> {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 7.2 Streaming for Large Responses

```typescript
// src/integrations/llm/base.ts
export class LLMService {
  async completeStream(
    prompt: string,
    options: LLMOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const stream = await this.provider.stream(prompt, options);
    let fullResponse = '';

    for await (const chunk of stream) {
      onChunk(chunk);
      fullResponse += chunk;
    }

    return fullResponse;
  }
}
```

---

## 8. Security Considerations

### 8.1 API Key Management

```typescript
// src/utils/security.ts
export class SecureStorage {
  async storeApiKey(provider: string, key: string): Promise<void> {
    // Use system keychain when available
    if (this.isKeychainAvailable()) {
      await this.storeInKeychain(`sdd-tool/${provider}`, key);
    } else {
      // Fallback to encrypted file storage
      await this.storeEncrypted(provider, key);
    }
  }

  async getApiKey(provider: string): Promise<string | null> {
    if (this.isKeychainAvailable()) {
      return await this.getFromKeychain(`sdd-tool/${provider}`);
    } else {
      return await this.getDecrypted(provider);
    }
  }
}
```

### 8.2 Input Validation

```typescript
// src/utils/validation.ts
import { z } from 'zod';

const TaskQuerySchema = z.object({
  query: z.string().min(1).max(10000),
  mode: z.enum(['plan', 'phases', 'review', 'epic']),
  files: z.array(z.string()).optional(),
  context: z.object({
    workingDir: z.string(),
    gitRef: z.string().optional()
  }).optional()
});

export function validateTaskQuery(data: unknown): TaskQuery {
  return TaskQuerySchema.parse(data);
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// tests/unit/plan-generator.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PlanGenerator } from '../../src/core/plan-generator';

describe('PlanGenerator', () => {
  let planGenerator: PlanGenerator;

  beforeEach(() => {
    // Mock dependencies
    planGenerator = new PlanGenerator(
      mockFileAnalyzer,
      mockLLMService,
      mockContextManager
    );
  });

  it('should generate a plan for a simple task', async () => {
    const task = createMockTask({
      query: 'Add user authentication',
      type: 'plan'
    });

    mockLLMService.complete.mockResolvedValue({
      content: createMockPlanResponse()
    });

    const plan = await planGenerator.generate(task);

    expect(plan.steps).toHaveLength(3);
    expect(plan.rationale).toBeDefined();
    expect(plan.steps[0].title).toBe('Create user model');
  });
});
```

### 9.2 Integration Tests

```typescript
// tests/integration/task-execution.test.ts
import { describe, it, expect } from 'vitest';
import { TaskEngine } from '../../src/core/task-engine';

describe('Task Execution Integration', () => {
  it('should complete full task lifecycle', async () => {
    const engine = new TaskEngine(realServices);

    // Create task
    const task = await engine.createTask(
      'Add user authentication',
      'plan',
      { workingDir: testProjectDir }
    );

    // Execute task
    const result = await engine.executeTask(task.id, {
      generatePlan: true,
      verify: true,
      agentId: 'claude-code'
    });

    expect(result.status).toBe('completed');
    expect(result.verification).toBeDefined();
  });
});
```

---

## 10. Deployment & Distribution

### 10.1 Package Structure

```
sdd-tool/
├── bin/
│   ├── sdd                      # Unix executable
│   └── sdd.cmd                  # Windows executable
├── dist/                        # Compiled JavaScript
│   ├── index.js
│   ├── commands/
│   ├── services/
│   └── ...
├── node_modules/
├── templates/
├── package.json
├── README.md
├── LICENSE
└── CHANGELOG.md
```

### 10.2 Build Process

```typescript
// build.ts
import { build } from 'esbuild';

await build({
  entryPoints: ['src/bin/sdd.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  external: ['fsevents'],
  banner: {
    js: '#!/usr/bin/env node'
  },
  minify: process.env.NODE_ENV === 'production'
});
```

---

## Conclusion

This architecture provides a solid foundation for building a personal Spec-Driven Development tool that is:

- **Modular**: Easy to extend and maintain
- **Performant**: Efficient caching and streaming
- **Secure**: Proper API key management and input validation
- **Testable**: Clean separation of concerns
- **Extensible**: Plugin architecture for future enhancements

The layer-based architecture ensures clear boundaries between components, making the codebase easier to understand and evolve over time.
