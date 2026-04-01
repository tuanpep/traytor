# Architecture

## Overview

Traytor is a spec-driven development CLI that orchestrates AI agents through a plan → execute → verify → review pipeline. It runs locally, calls LLM APIs directly (Anthropic, OpenAI), and stores all data as JSON files on disk.

## Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│  CLI Entry Point (src/bin/traytor.ts)               │
│  Commander.js commands → run*Command functions      │
├─────────────────────────────────────────────────────┤
│  Commands (src/commands/)                            │
│  Thin wrappers: parse options, call services        │
├─────────────────────────────────────────────────────┤
│  Services (src/services/)                            │
│  Business logic: PlanGenerator, Verifier, etc.      │
├─────────────────────────────────────────────────────┤
│  Core (src/core/)                                    │
│  File analysis, context management, verification     │
├─────────────────────────────────────────────────────┤
│  Integrations (src/integrations/)                   │
│  LLM providers (Anthropic, OpenAI), MCP client      │
├─────────────────────────────────────────────────────┤
│  Data (src/data/)                                    │
│  FileStorage<T>, TaskRepository, validation schemas  │
├─────────────────────────────────────────────────────┤
│  Models (src/models/)                                │
│  TypeScript interfaces, ID factory functions         │
├─────────────────────────────────────────────────────┤
│  Config (src/config/)                                │
│  Zod-validated config cascade with env var override  │
└─────────────────────────────────────────────────────┘
```

## Dependency Injection

Manual DI via `bootstrap()` in `src/app/bootstrap.ts`. It constructs all services and returns an `AppContext` object. Commands receive `AppContext` (or individual services extracted from it).

```
bootstrap() → AppContext {
  config, taskService, planGenerator, agentService,
  verifier, reviewGenerator, workflowEngine, gitService,
  epicService, epicGenerator, templateEngine, llmService, mcpClient
}
```

## Core Pipeline

### 1. Plan (`traytor plan <query>`)
1. `FileAnalyzer` scans the codebase (`.gitignore`-aware)
2. `ContextManager` gathers relevant context (CLAUDE.md, AGENTS.md, etc.)
3. `PlanGenerator` calls LLM with a Handlebars template to generate a structured plan
4. Plan is persisted as a `Task` (type: `plan`) via `TaskRepository`

### 2. Execute (`traytor exec <task-id>`)
1. Task is loaded from storage
2. Plan is rendered into an agent prompt via `TemplateEngine`
3. `AgentService` spawns the configured CLI agent (Claude Code, etc.)
4. Execution record (stdout, stderr, exit code, duration) is saved

### 3. Verify (`traytor verify <task-id>`)
1. Codebase is re-analyzed
2. `Verifier` sends plan + current code to LLM for comparison
3. Returns categorized comments (severity: critical/major/minor, status: open/fixed/ignored)
4. Supports `--fix` mode to send comments to an agent for resolution

### 4. Review (`traytor review`)
1. Gathers git diff (against branch, commit, or uncommitted)
2. Sends diff to LLM for code review
3. Returns categorized comments (bug, performance, security, clarity)

## Data Flow

```
User Query → FileAnalyzer → ContextManager → LLM (template) → Plan → Agent → Code Changes
                                                                         ↓
                                                                    Verifier → Comments
                                                                         ↓
                                                                    Agent (fix) → Code Changes
```

## Storage

All data is stored locally at `~/.traytor/data/`:
- `tasks/` — JSON files per task (one file per task ID)
- `workflows/` — Workflow state files
- API keys stored via system keychain or encrypted files at `~/.traytor/keys/`

## Configuration Cascade

Priority (highest to lowest):
1. Environment variables (`ANTHROPIC_API_KEY`, `SDD_PROVIDER`, etc.)
2. Project config (`.traytor/config.yaml`)
3. User config (`~/.traytor/config.yaml`)
4. Defaults (defined in `src/config/schema.ts` with Zod)

## Error Handling

All errors extend `TraytorError` with `code`, `message`, `suggestion`, and `details`. Error codes map to CLI exit codes. MCP operations include automatic retry with exponential backoff for transient failures (429, 5xx).

## Key Design Decisions

- **Local-first**: No cloud dependencies. All processing happens on the user's machine.
- **Template-based prompts**: All LLM interactions use Handlebars templates in `src/templates/`.
- **Agent-agnostic**: Any CLI tool can be configured as an agent via `traytor agent add`.
- **JSON file storage**: Simple, debuggable, no database dependency.
