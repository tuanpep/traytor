---
name: traytor
description: Comprehensive spec-driven development CLI for AI-assisted coding. Plan, execute, verify, review, and manage epics/tickets/phases with AI agents. Use when the user wants to plan features, generate implementation plans, execute tasks with AI agents, verify code against plans, run code reviews, break work into phases, manage epics with specs and tickets, or automate multi-phase development workflows.
license: ISC
compatibility: Requires traytor CLI installed globally (npm i -g or pnpm link --global) and configured with an LLM provider (Anthropic or OpenAI)
metadata:
  author: tuanpep
  version: '1.0'
---

# Traytor — Spec-Driven Development CLI

Comprehensive AI-assisted development workflow: plan → execute → verify → review.

## Quick Reference

| Command                    | Purpose                            |
| -------------------------- | ---------------------------------- |
| `traytor plan <query>`     | Generate implementation plan       |
| `traytor exec <task-id>`   | Execute task with AI agent         |
| `traytor verify <task-id>` | Verify implementation against plan |
| `traytor review [query]`   | Run agentic code review            |
| `traytor phases <query>`   | Break task into sequential phases  |
| `traytor epic <query>`     | Create epic with AI elicitation    |
| `traytor yolo <task-id>`   | Automated multi-phase execution    |
| `traytor tui`              | Interactive terminal dashboard     |

---

## 1. Plan — Generate Implementation Plans

Analyze codebase and generate structured, step-by-step implementation plans.

```bash
# Basic plan
traytor plan "Add user authentication with JWT tokens"

# Plan with specific files
traytor plan "Refactor database queries" -f src/db/queries.ts src/db/connection.ts

# Export plan as markdown
traytor plan "Implement search feature" -o markdown --output-file plan.md

# Plan with verbose logging
traytor plan "Fix memory leak in WebSocket handler" -v
```

**Options:**

- `-f, --files <files...>` — Specific files to include in analysis
- `-o, --output <format>` — Output: terminal, clipboard, markdown, json (default: terminal)
- `--output-file <path>` — Write output to file (for markdown/json)
- `-v, --verbose` — Show verbose output

**Plan output includes:** step-by-step steps, file modifications/creations, dependencies, testing strategy.

---

## 2. Exec — Execute Tasks with AI Agents

Run AI agents to implement planned tasks automatically.

```bash
# Execute a task
traytor exec task-123

# Execute with specific agent
traytor exec task-123 --agent claude

# Execute specific phase of a phases task
traytor exec task-123 --phase 2

# Execute with custom timeout
traytor exec task-123 --timeout 300000

# Execute with specific template
traytor exec task-123 --template custom-template
```

**Options:**

- `--cwd <path>` — Working directory for the agent
- `--timeout <ms>` — Timeout in milliseconds
- `--phase <n>` — Execute specific phase (for phases tasks)
- `--agent <name>` — Use specific agent by name
- `--template <name>` — Use specific template by name

### Managing Agents

```bash
# List configured agents
traytor agent list

# Add a new agent
traytor agent add claude --command "claude" --args "--dangerously-skip-permissions"

# Set default agent
traytor agent set-default claude

# Remove an agent
traytor agent remove claude
```

---

## 3. Verify — Check Implementation Against Plan

AI-powered verification that implemented code matches the original plan.

```bash
# Basic verification
traytor verify task-123

# Verify specific phase
traytor verify task-123 --phase 2

# Re-verify after changes
traytor verify task-123 --mode reverify

# Fix all critical and major issues automatically
traytor verify task-123 --fix --severity critical,major

# Fix specific comments
traytor verify task-123 --fix --fix-comment-ids abc123,def456

# Mark a comment as fixed or ignored
traytor verify task-123 --fix-comment abc123 --fix-comment-status fixed

# Dry run fix operations
traytor verify task-123 --fix --dry-run
```

**Options:**

- `--cwd <path>` — Working directory to analyze
- `--phase <n>` — Verify specific phase
- `--mode <mode>` — Verification mode: fresh (default) or reverify
- `--fix` — Fix verification comments using an agent
- `--fix-all` — Fix all blocking comments
- `--severity <levels>` — Severity levels to fix: critical,major,minor
- `--agent <name>` — Agent to use for fixing
- `--dry-run` — Dry run for fix operations

**Verification reports include:** plan compliance, missing implementations, code quality issues, severity levels (critical/major/minor), suggested fixes.

---

## 4. Review — Agentic Code Reviews

AI-powered code reviews with automated analysis and fix capabilities.

```bash
# Review current changes
traytor review

# Review with focus area
traytor review "Check for security vulnerabilities"

# Review specific files
traytor review -f src/auth.ts src/middleware.ts

# Review against main branch
traytor review --against main

# Review last 3 commits
traytor review --against HEAD~3

# Export review as markdown
traytor review -o markdown --output-file review.md

# Fix code based on review comments
traytor review --fix --task-id task-123
```

**Options:**

- `-f, --files <files...>` — Specific files to review
- `--against <ref>` — Git ref to compare against (e.g., main, HEAD~3)
- `-o, --output <format>` — Output: terminal, markdown, json
- `--output-file <path>` — Write output to file
- `--cwd <path>` — Working directory to analyze
- `--fix` — Fix mode: send review comments to agent for fixing
- `--task-id <id>` — Task ID (required for --fix mode)
- `--fix-comment-ids <ids>` — Comma-separated comment IDs to fix

---

## 5. Phases — Break Tasks into Sequential Phases

Decompose complex tasks into ordered, manageable phases.

### Create Phases

```bash
traytor phases "Build a complete REST API with authentication"
traytor phases "Migrate from REST to GraphQL" -f src/api/*.ts
```

### Manage Phases

```bash
# List all phases
traytor phases:list task-123

# Add a new phase
traytor phases:add task-123 --name "Add caching layer" --description "Implement Redis caching"

# Insert phase after specific phase
traytor phases:insert task-123 --name "Add rate limiting" --insert-after 2

# Reorder phases
traytor phases:reorder task-123 phase-1 phase-3 phase-2

# Delete a phase (by order number, 1-based)
traytor phases:delete task-123 3
```

### Execute Phases

```bash
# Execute specific phase
traytor exec task-123 --phase 2

# Or use YOLO mode for automated execution (see section 7)
traytor yolo task-123
```

---

## 6. Epic — Manage Epics, Specs, and Tickets

AI-guided elicitation for project planning with specs and tickets.

### Create Epic

```bash
# Interactive epic creation with AI elicitation
traytor epic "Build authentication system"

# Non-interactive (use defaults)
traytor epic "Build authentication system" --auto

# Custom elicitation rounds
traytor epic "Build authentication system" --max-rounds 5

# Export as markdown
traytor epic "Build authentication system" -o markdown --output-file epic.md
```

### Manage Specs

Specs are documents within an epic: PRD, tech, design, API.

```bash
# List specs
traytor epic --task-id epic-123 --spec list

# Create a PRD
traytor epic --task-id epic-123 --spec create --spec-type prd --spec-title "User Auth PRD"

# Create a tech spec
traytor epic --task-id epic-123 --spec create --spec-type tech --spec-title "Auth Architecture"

# Edit a spec
traytor epic --task-id epic-123 --spec edit --spec-id spec-456 --spec-title "Updated Title"
```

### Manage Tickets

```bash
# List tickets
traytor epic --task-id epic-123 --ticket list

# Create a ticket
traytor epic --task-id epic-123 --ticket create --ticket-title "Implement login endpoint" --ticket-description "POST /api/login with JWT response"

# Edit a ticket
traytor epic --task-id epic-123 --ticket edit --ticket-id ticket-789 --ticket-title "Updated title"

# Update ticket status
traytor epic --task-id epic-123 --ticket status --ticket-id ticket-789 --ticket-status in_progress
```

**Ticket statuses:** `todo`, `in_progress`, `done`
**Spec types:** `prd`, `tech`, `design`, `api`

---

## 7. YOLO — Automated Multi-Phase Execution

Fully automated phase-by-phase execution with planning and verification.

```bash
# Execute all phases automatically
traytor yolo task-123

# Start from phase 3
traytor yolo task-123 --from-phase 3

# End at phase 5
traytor yolo task-123 --to-phase 5

# Skip plan generation for each phase
traytor yolo task-123 --skip-planning

# Skip verification
traytor yolo task-123 --no-verify

# Auto-commit after each phase
traytor yolo task-123 --auto-commit

# Dry run (show what would happen)
traytor yolo task-123 --dry-run

# Custom agents for different stages
traytor yolo task-123 --agent claude --plan-agent sonnet --verify-agent opus
```

**Options:**

- `--from-phase <n>` — Start from phase N
- `--to-phase <n>` — End at phase N
- `--skip-planning` — Skip plan generation for each phase
- `--agent <name>` — Agent for execution
- `--plan-agent <name>` — Agent for planning
- `--verify-agent <name>` — Agent for verification
- `--no-verify` — Skip verification after each phase
- `--verify-severity <levels>` — Severity levels to verify
- `--auto-commit` — Auto-commit after each phase
- `--commit-msg <template>` — Commit message template
- `--timeout <ms>` — Execution timeout
- `--max-retries <n>` — Max retries per phase
- `--dry-run` — Show what would happen without executing
- `--parallel` — Execute phases in parallel (for independent phases)

---

## 8. Additional Commands

### Task History

```bash
# View all tasks
traytor history

# Filter by status
traytor history --status done

# Filter by type
traytor history --type plan

# Limit results
traytor history --limit 10

# JSON output
traytor history -o json
```

### Git Operations

```bash
traytor git status
traytor git diff main
traytor git commit "feat: add auth" --files src/auth.ts src/middleware.ts
```

### Workflows

```bash
traytor workflow list
traytor workflow show my-workflow
traytor workflow create deploy --description "Deploy workflow" --steps "build,test,deploy"
traytor workflow state wf-123
traytor workflow advance wf-123
traytor workflow pause wf-123
traytor workflow resume wf-123
```

### Templates

```bash
traytor template list
traytor template show plan
traytor template create custom --content "Your template content"
traytor template edit plan --content "Updated content"
```

### Model Profiles

```bash
traytor model-profile list
traytor model-profile show balanced
traytor model-profile set --type plan frontier
```

### Configuration

```bash
traytor config show
traytor config set-key anthropic sk-ant-xxx
traytor config get-key anthropic
traytor config remove-key anthropic
```

### Usage Statistics

```bash
traytor usage
traytor usage task-123
```

### Mermaid Diagrams

```bash
traytor mermaid show task-123
traytor mermaid url task-123
traytor mermaid export task-123 --output diagram.mmd
traytor mermaid generate task-123
```

### Ticket Assist (GitHub Integration)

```bash
traytor ticket-assist list owner repo
traytor ticket-assist plan owner repo --issue-number 42
traytor ticket-assist show owner repo --issue-number 42
```

### Interactive TUI

```bash
traytor tui
```

---

## Typical Workflow

1. **Plan:** `traytor plan "Add feature X"` → get task-id
2. **Execute:** `traytor exec task-id` or `traytor yolo task-id` for phases
3. **Verify:** `traytor verify task-id` → fix issues if needed
4. **Review:** `traytor review --against main` → final code review
5. **Commit:** `traytor git commit "feat: X"` → commit changes

## For Complex Projects

1. **Epic:** `traytor epic "Build platform"` → create epic with specs and tickets
2. **Phases:** `traytor phases "Implement auth"` → break into phases
3. **YOLO:** `traytor yolo task-id --auto-commit` → automated execution
4. **Track:** `traytor epic --task-id epic-id --ticket status` → track progress
