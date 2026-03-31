# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Traytor** (`sdd`) is a personal spec-driven development CLI tool. It uses AI (Anthropic Claude, OpenAI) to generate implementation plans, execute tasks with AI agents, verify code against plans, and manage multi-phase projects through epics and workflows. It ships as a CLI (`sdd`) and has a companion VS Code extension.

## Commands

```bash
pnpm build          # Build (tsup → dist/index.js, ESM, node18)
pnpm dev            # Run CLI directly via tsx
pnpm test           # Run all tests (vitest)
pnpm test -- tests/plan-generator.test.ts        # Run a single test file
pnpm test -- -t "parsePlanResponse"             # Run tests matching a name
pnpm typecheck       # TypeScript type checking (tsc --noEmit)
pnpm lint            # ESLint
pnpm format:check    # Prettier check
```

## Architecture

### Layered Design

```
src/bin/sdd.ts          CLI entry point (Commander.js), registers all commands, bootstraps AppContext
src/app/bootstrap.ts    Wires up all services and returns AppContext (manual DI)
src/commands/           Command handlers — thin wrappers that call services from AppContext
src/services/           Business logic (PlanGenerator, PhaseGenerator, Verifier, AgentService, etc.)
src/core/               File analysis, context management, verification engine
src/integrations/llm/   Multi-provider LLM layer (Anthropic, OpenAI) with retry
src/integrations/mcp/   MCP client integration
src/data/               FileStorage<T> (JSON files), TaskRepository, validation schemas
src/models/             TypeScript interfaces and ID factory functions (Task, Plan, Epic, Workflow, etc.)
src/config/             Zod-validated config with layered override: defaults → user → project → env → keychain
src/utils/              Logger, SDDError hierarchy, platform helpers, secure storage
src/ui/tui/             Interactive terminal UI (dashboard, task list, plan viewer)
src/ui/cli/             Output formatting
extension/              VS Code extension (separate tsconfig, own build)
```

### Key Patterns

- **Manual dependency injection** via `bootstrap()` in [bootstrap.ts](src/app/bootstrap.ts) — constructs all services and returns `AppContext` with every service reference. Commands receive `AppContext`.
- **Error hierarchy**: All errors extend `SDDError` (with `code`, `suggestion`, `details`). Domain-specific subclasses: `TaskNotFoundError`, `PlanGenerationError`, `LLMProviderError`, `GitError`, `WorkflowError`, etc. See [errors.ts](src/utils/errors.ts).
- **ID generation**: Each model has a `createXxxId()` factory function (e.g., `createTaskId()`, `createPlanStepId()`).
- **LLM abstraction**: `LLMService` routes to `AnthropicProvider` or `OpenAIProvider` based on config. Supports model profiles (balanced/frontier/custom). All LLM calls go through `LLMService.complete()` or `.stream()`.
- **Prompt templating**: `TemplateEngine` uses Handlebars. Templates live in `.sdd-tool/templates/` (project dir). Built-in templates for plan generation, verification, and review.
- **Storage**: `FileStorage<T>` persists JSON files to `~/.sdd-tool/data/tasks/`. `TaskRepository` wraps it for task CRUD.
- **Config cascade**: defaults → `~/.sdd-tool/config.yaml` → `.sdd-tool/config.yaml` → env vars (`SDD_PROVIDER`, `ANTHROPIC_API_KEY`, etc.) → system keychain. Validated with Zod.
- **Task types**: `plan`, `phases`, `review`, `epic`, `exec`. Each has a corresponding model and service flow.

### Core Workflow

1. `sdd plan <query>` — `PlanGenerator` analyzes codebase (`FileAnalyzer`), gathers context (`ContextManager`), calls LLM to generate a structured plan, persists as `Task`
2. `sdd exec <task-id>` — `AgentService` runs a configured agent (Claude Code, Codex, or custom CLI) against the task's plan
3. `sdd verify <task-id>` — `Verifier` compares implementation against plan using LLM analysis
4. `sdd epic <query>` — `EpicGenerator` runs AI-guided elicitation to create epics with specs and tickets

## Code Conventions

- ESM project (`"type": "module"`) — all imports use `.js` extensions
- TypeScript strict mode, ES2022 target
- Prettier: single quotes, semicolons, 2-space indent, 100 char line width, trailing commas (ES5)
- ESLint with `@typescript-eslint` — `no-explicit-any` is a warning, `no-console` is off
- Tests use Vitest — test files in `tests/` mirror `src/` structure. Unit tests in `tests/unit/`. LLM-dependent tests mock the service.

## VS Code Extension

Separate TypeScript project in `extension/` with its own `tsconfig.json` and `package.json`. Build with `cd extension && pnpm build`. Register commands and a sidebar treeview for task management.

## Configuration

Config files at `~/.sdd-tool/config.yaml` (user) and `.sdd-tool/config.yaml` (project). Key env vars: `SDD_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SDD_LOG_LEVEL`, `SDD_DATA_DIR`. Model profiles can be defined in config for different task types.
