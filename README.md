# Traytor — Spec-Driven Development CLI

A spec-driven development CLI tool that leverages AI (Anthropic Claude, OpenAI) to generate implementation plans, execute tasks with AI agents, verify code against plans, and manage multi-phase projects through epics and workflows.

## Installation

```bash
npm install -g traytor
# or
pnpm add -g traytor
```

## Quick Start

### 1. Configure API Keys

Set your LLM provider API key via environment variables:

```bash
# Anthropic (default)
export ANTHROPIC_API_KEY="sk-ant-..."

# Or OpenAI
export OPENAI_API_KEY="sk-..."
export TRAYTOR_PROVIDER="openai"
```

Or use the config command:

```bash
traytor config set-key anthropic sk-ant-...
```

### 2. Generate a Plan

```bash
traytor plan "Implement user authentication with JWT"
```

### 3. Execute the Plan

```bash
traytor exec <task-id>
```

### 4. Verify the Implementation

```bash
traytor verify <task-id>
```

## Commands

| Command                                | Description                                                          |
| -------------------------------------- | -------------------------------------------------------------------- |
| `traytor plan <query>`                 | Generate an implementation plan for a task                           |
| `traytor exec <task-id>`               | Execute a task with an AI agent                                      |
| `traytor verify <task-id>`             | Verify a task implementation against its plan                        |
| `traytor review [query]`               | Run an agentic code review                                           |
| `traytor phases <query>`               | Break a complex task into sequential phases                          |
| `traytor phases:list <id>`             | List all phases for a task                                           |
| `traytor phases:add <id>`              | Add a new phase                                                      |
| `traytor phases:reorder <id> <ids...>` | Reorder phases                                                       |
| `traytor phases:delete <id> <order>`   | Delete a phase                                                       |
| `traytor yolo <task-id>`               | Run automated phase execution                                        |
| `traytor epic <query>`                 | Start an epic with AI elicitation                                    |
| `traytor workflow <sub>`               | Manage workflows (list, show, create, state, advance, pause, resume) |
| `traytor git <sub>`                    | Git operations (status, diff, commit)                                |
| `traytor agent <sub>`                  | Manage custom CLI agents (list, add, remove, set-default)            |
| `traytor template <sub>`               | Manage prompt templates (list, show, create, edit)                   |
| `traytor history`                      | View task history                                                    |
| `traytor tui`                          | Open interactive Terminal UI dashboard                               |
| `traytor mermaid <sub>`                | Generate Mermaid diagrams from tasks/plans/phases                    |
| `traytor ticket-assist`                | GitHub issue integration                                             |
| `traytor model-profile <sub>`          | Manage model profiles                                                |
| `traytor config <sub>`                 | Manage configuration and API keys                                    |
| `traytor usage [id]`                   | Show token usage statistics                                          |
| `traytor help [command]`               | Show detailed help for a command                                     |

## Usage Examples

### Plan, Execute, Verify Workflow

```bash
# Generate a plan for a feature
traytor plan "Add pagination to the user list API endpoint"

# Execute the generated plan
traytor exec task_abc123

# Verify the implementation matches the plan
traytor verify task_abc123
```

### Multi-Phase Development

```bash
# Break a complex feature into phases
traytor phases "Build a complete CRUD REST API with auth, validation, and tests"

# Execute all phases automatically with YOLO mode
traytor yolo task_def456 --auto-commit

# Or execute specific phases
traytor exec task_def456 --phase 1
traytor exec task_def456 --phase 2
```

### Epic Management with Specs and Tickets

```bash
# Start an epic with AI-guided elicitation
traytor epic "Build an e-commerce platform"

# List specs for the epic
traytor epic --task-id epic_001 --spec list

# Create a ticket
traytor epic --task-id epic_001 --ticket create \
  --ticket-title "User registration flow" \
  --ticket-description "Implement signup, login, and password reset"

# Update ticket status
traytor epic --task-id epic_001 --ticket status \
  --ticket-id ticket_001 \
  --ticket-status in_progress
```

### Code Review

```bash
# Review current changes against main
traytor review "Focus on security and error handling" --against main

# Review specific files
traytor review "Check for performance issues" -f src/api/*.ts src/db/*.ts

# Fix code based on review comments
traytor review --fix --task-id task_123
```

## Configuration

Configuration is loaded in order (later overrides earlier):

1. Built-in defaults
2. `~/.traytor/config.yaml` (user config)
3. `.traytor/config.yaml` (project config)
4. Environment variables

### Environment Variables

| Variable            | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `ANTHROPIC_API_KEY` | Anthropic API key                                      |
| `OPENAI_API_KEY`    | OpenAI API key                                         |
| `TRAYTOR_PROVIDER`  | Default LLM provider (`anthropic` or `openai`)         |
| `TRAYTOR_LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`, `silent`) |
| `TRAYTOR_DATA_DIR`  | Data directory path                                    |

### Model Profiles

Configure model profiles in your config for different task types:

```yaml
modelProfiles:
  balanced:
    provider: anthropic
    model: claude-sonnet-4-20250514
  frontier:
    provider: anthropic
    model: claude-opus-4-20250514
  custom:
    fast:
      provider: openai
      model: gpt-4o-mini
```

## VS Code Extension

A companion VS Code extension provides IDE integration:

- **Command Palette**: `Traytor: Create Plan`, `Traytor: Execute Task`, `Traytor: Verify Task`
- **Sidebar**: Task list with real-time status updates
- **Output Channel**: Execution logs

Install from the `extension/` directory:

```bash
cd extension && pnpm install && pnpm build
```

Then in VS Code: `Extensions > ... > Install from VSIX` or launch in Extension Development Host.

## Architecture

The project follows a layered architecture:

- **CLI Layer** (`src/bin/`, `src/commands/`): Command definitions and handlers
- **Service Layer** (`src/services/`): Business logic (plan generation, verification, agents)
- **Core Layer** (`src/core/`): File analysis, context management, verification engine
- **Integration Layer** (`src/integrations/`): LLM providers (Anthropic, OpenAI), MCP
- **Data Layer** (`src/data/`): Repositories, storage, validation
- **Utils** (`src/utils/`): Logger, errors, platform utilities, secure storage

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run in dev mode
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## License

ISC
