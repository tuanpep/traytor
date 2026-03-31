# SDD - Spec Driven Development CLI

A personal spec-driven development CLI tool that leverages AI (Anthropic Claude, OpenAI) to generate implementation plans, execute tasks with AI agents, verify code against plans, and manage multi-phase projects through epics and workflows.

## Installation

```bash
# Clone the repository
git clone <repo-url> && cd traytor

# Install dependencies
pnpm install

# Build the project
pnpm build

# Link globally for the `sdd` command
npm link
```

## Quick Start

### 1. Configure API Keys

Set your LLM provider API key via environment variables:

```bash
# Anthropic (default)
export ANTHROPIC_API_KEY="sk-ant-..."

# Or OpenAI
export OPENAI_API_KEY="sk-..."
export SDD_PROVIDER="openai"
```

Or create a config file at `~/.sdd-tool/config.yaml`:

```yaml
provider: anthropic
anthropic:
  model: claude-sonnet-4-20250514
  maxTokens: 4096
  temperature: 0
```

### 2. Generate a Plan

```bash
sdd plan "Implement user authentication with JWT"
```

### 3. Execute the Plan

```bash
sdd exec <task-id>
```

### 4. Verify the Implementation

```bash
sdd verify <task-id>
```

## Commands

| Command | Description |
|---------|-------------|
| `sdd plan <query>` | Generate an implementation plan for a task |
| `sdd phases <query>` | Break a complex task into sequential phases |
| `sdd exec <task-id>` | Execute a task with an AI agent |
| `sdd verify <task-id>` | Verify a task implementation against its plan |
| `sdd review <query>` | Run an agentic code review |
| `sdd epic <query>` | Start an epic with AI elicitation |
| `sdd workflow <sub>` | Manage workflows (list, show, create, state, advance, pause, resume) |
| `sdd git <sub>` | Git operations (status, diff, commit) |
| `sdd agent <sub>` | Manage custom CLI agents |
| `sdd template <sub>` | Manage prompt templates |
| `sdd history` | View task history |
| `sdd help <command>` | Show detailed help for a command |

## Usage Examples

### Example 1: Plan, Execute, Verify Workflow

```bash
# Generate a plan for a feature
sdd plan "Add pagination to the user list API endpoint"

# Execute the generated plan
sdd exec task_abc123

# Verify the implementation matches the plan
sdd verify task_abc123
```

### Example 2: Multi-Phase Development

```bash
# Break a complex feature into phases
sdd phases "Build a complete CRUD REST API with auth, validation, and tests"

# Execute specific phases
sdd exec task_def456 --phase 1
sdd exec task_def456 --phase 2

# Verify individual phases
sdd verify task_def456 --phase 1
```

### Example 3: Epic Management with Specs and Tickets

```bash
# Start an epic with AI-guided elicitation
sdd epic "Build an e-commerce platform"

# List specs for the epic
sdd epic --task-id epic_001 --spec list

# Create a ticket
sdd epic --task-id epic_001 --ticket create \
  --ticket-title "User registration flow" \
  --ticket-description "Implement signup, login, and password reset"

# Update ticket status
sdd epic --task-id epic_001 --ticket status \
  --ticket-id ticket_001 \
  --ticket-status in_progress
```

### Example 4: Code Review

```bash
# Review current changes against main
sdd review "Focus on security and error handling" --against main

# Review specific files
sdd review "Check for performance issues" --files src/api/*.ts src/db/*.ts
```

## Configuration

Configuration is loaded in order (later overrides earlier):

1. Built-in defaults
2. `~/.sdd-tool/config.yaml` (user config)
3. `.sdd-tool/config.yaml` (project config)
4. Environment variables

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `SDD_PROVIDER` | Default LLM provider (`anthropic` or `openai`) |
| `SDD_LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`, `silent`) |
| `SDD_DATA_DIR` | Data directory path |

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

- **Command Palette**: `SDD: Create Plan`, `SDD: Execute Task`, `SDD: Verify Task`
- **Sidebar**: Task list with real-time status updates
- **Output Channel**: Execution logs

Install from the `extension/` directory:

```bash
cd extension && npm install && npm run build
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

## License

ISC
