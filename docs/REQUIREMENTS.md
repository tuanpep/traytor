# Personal Spec-Driven Development Tool - Requirements Document

## Project Overview

**Name**: Personal SDD Tool (Personal Spec-Driven Development)
**Purpose**: Build a lightweight,个人用途的 Spec-Driven Development tool that helps individuals prevent AI agent drift by providing structured plans, verification, and agent orchestration.
**Inspired by**: Traycer.ai

---

## 1. Core Philosophy

The tool solves the fundamental problem of AI agent drift:
- Agents hallucinate APIs, misread intent, and break existing code
- Simple ideas dissolve into scattered prompts and code churn
- **Solution**: Transform intent into working specs with structured plans
- Agents execute against the plan, and the tool verifies their work
- Less drift, fewer surprises, production-ready code by default

---

## 2. Target User Profile

**Primary Users**:
- Individual developers who use AI coding assistants (Claude Code, Cursor, Cline, etc.)
- Developers working on personal projects or side projects
- Solo developers who want structured AI-assisted workflows
- Open-source maintainers who need consistent AI-generated code

**Key Characteristics**:
- Comfortable with CLI tools
- Use AI coding agents daily
- Want better control over AI-generated code
- Need verification of implementation against specs
- Prefer lightweight, privacy-focused solutions

---

## 3. Core Features Requirements

### 3.1 Task Management System

#### 3.1.1 Task Modes
- **Plan Mode**: Direct, step-by-step implementation for single-PR tasks
- **Phases Mode**: Structured multi-phase development for complex projects
- **Review Mode**: Agentic code review with categorized findings
- **Epic Mode**: Collaborative spec-driven development (simplified for personal use)

#### 3.1.2 Task Lifecycle
```
User Query → Plan Generation → Agent Execution → Verification → Complete
         ↓                                    ↓
    [Iteration]                          [Fix Cycle]
```

#### 3.1.3 Task Metadata
- Unique task ID
- User query/goal description
- Task mode (Plan/Phases/Review/Epic)
- Creation timestamp
- Last modified timestamp
- Status (pending, in_progress, completed, failed)
- Related files and context
- Git branch/reference

### 3.2 Plan Generation

#### 3.2.1 Plan Components
- **User Query Analysis**: Parse user intent, goals, constraints
- **File Analysis**: Identify files to modify, read, create
- **Symbol References**: Function/class references with locations
- **Implementation Steps**: Ordered list of actionable steps
- **Mermaid Diagrams**: Visual workflow representations (optional)
- **Context & Rationale**: Decisions and reasoning

#### 3.2.2 Plan Iteration
- Chat interface to refine plans
- Ask clarifying questions
- Modify plan based on feedback
- Preserve iteration history

#### 3.2.3 Plan Export
- Copy to clipboard (markdown format)
- Export as markdown file
- Export as JSON for programmatic use

### 3.3 Agent Integration

#### 3.3.1 Supported Agents
- **CLI-based Agents**:
  - Claude Code CLI
  - Codex CLI
  - Gemini CLI
  - Cline CLI
  - Aider
  - Factory Droid CLI
  - Cursor CLI
- **Extension-based Agents** (via IPC/API):
  - Cursor Extension
  - VS Code Extensions (Claude Code, Cline, etc.)

#### 3.3.2 Agent Handoff
- Template-based prompt generation
- Environment variable injection:
  - TRAYCER_PROMPT: Main prompt content
  - TRAYCER_PROMPT_TMP_FILE: File path for large prompts
  - TRAYCER_TASK_ID: Task identifier
  - TRAYCER_PHASE_ID: Phase identifier (for Phases mode)
  - TRAYCER_SYSTEM_PROMPT: System-level instructions

#### 3.3.3 Custom CLI Agents
- Create custom agent configurations
- Pass custom flags (e.g., --dangerous, --verbose)
- Specify full paths for custom installations
- Support both Bash and PowerShell syntax

### 3.4 Verification System

#### 3.4.1 Verification Process
- Compare agent implementation against original plan
- Analyze code changes
- Identify deviations and gaps
- Generate review comments

#### 3.4.2 Comment Categories
- **Critical**: Blocks core functionality or plan requirements
- **Major**: Significant issues affecting behavior/UX
- **Minor**: Small polish items
- **Outdated**: Comments no longer relevant

#### 3.4.3 Fix Workflow
- Fix individual comments
- Fix selected comments (batch)
- Fix all comments at once
- Re-verify after fixes

#### 3.4.4 Verification Modes
- **Re-verify**: Focused pass checking previous issues (faster)
- **Fresh Verification**: Complete re-analysis (thorough)

### 3.5 Phases Mode (Advanced)

#### 3.5.1 Phase Management
- Create multiple phases for complex projects
- Each phase has independent plan and execution
- Context preservation across phases
- Phase status tracking (pending, in_progress, completed, blocked)

#### 3.5.2 Phase Operations
- Insert new phases between existing ones
- Reorder phases (drag and drop)
- Merge phases
- Split phases
- Add new phases dynamically

#### 3.5.3 Context Carry-over
- File mappings from previous phases
- Decisions and rationale
- Code changes reference
- Configuration propagation

### 3.6 Epic Mode (Simplified for Personal Use)

#### 3.6.1 Artifact System
- **Specs**: Mini-specs capturing requirements
  - PRD (Product Requirements Document)
  - Tech Doc (Technical approach)
  - Design Spec (UX decisions)
  - API Spec (API contracts)
- **Tickets**: Actionable work items
  - Acceptance criteria
  - Status tracking (Todo → In Progress → Done)
  - Link to related specs

#### 3.6.2 Workflow System
- Default workflow (simplified Traycer Agile Workflow)
- Custom workflow creation
- Command-based navigation
- Multi-path workflows with branching

#### 3.6.3 AI Elicitation
- Ask clarifying questions to capture intent
- Make implicit decisions explicit
- Document "invisible rules" and constraints
- Multiple rounds of questions normal

### 3.7 Review Mode

#### 3.7.1 Code Review Features
- Deep code exploration across files
- Implementation analysis with context
- Categorized review comments
- Impact assessment

#### 3.7.2 Review Categories
- **Bug**: Functional issues, logic errors
- **Performance**: Inefficiencies, bottlenecks
- **Security**: Vulnerabilities, unsafe practices
- **Clarity**: Readability, maintainability, documentation

### 3.8 History & State Management

#### 3.8.1 History Tracking
- Complete timeline of all tasks
- Plan evolution history
- Phase progression
- Conversation history
- Context preservation

#### 3.8.2 Persistence
- Local storage (SQLite or file-based)
- State serialization to JSON
- Task metadata indexing
- Fast search and retrieval

#### 3.8.3 Search & Filter
- Fuzzy search across task titles and queries
- Filter by status, mode, date range
- Workspace/project filtering
- Tag-based organization

---

## 4. Technical Requirements

### 4.1 Architecture
- **Language**: TypeScript/JavaScript (Node.js)
- **Framework**: CLI framework (Commander.js, Yargs, or similar)
- **UI**: Terminal UI (TUI) with optional GUI components
- **Storage**: Local file system with optional SQLite
- **Configuration**: YAML/JSON config files

### 4.2 AI/LLM Integration
- **Primary LLM Provider**: Support multiple providers
  - Anthropic Claude (primary for compatibility)
  - OpenAI GPT-4
  - Ollama (local models)
  - Custom OpenAI-compatible endpoints
- **Model Selection**:
  - Balanced profile (default)
  - Frontier profile (high quality)
  - Custom model selection per task type
- **Cost Tracking**: Estimate and track token usage

### 4.3 File System Operations
- **Codebase Analysis**:
  - Recursive directory scanning
  - File type filtering (.ts, .js, .py, .go, etc.)
  - Git integration (diff against branches/commits)
  - Symbol extraction (AST parsing for popular languages)
- **File Watching**: Monitor file changes for verification
- **Context Gathering**:
  - AGENTS.md detection and parsing
  - README.md integration
  - Custom context files

### 4.4 Git Integration
- **Repository Detection**: Auto-detect git repositories
- **Diff Operations**:
  - Diff against uncommitted changes
  - Diff against main branch
  - Diff against specific branches
  - Diff against commits
- **Commit Management**:
  - Auto-commit after successful verification (optional)
  - Commit message templates
  - Git hooks integration

### 4.5 Template System
- **Template Engine**: Handlebars.js compatible
- **Template Types**:
  - Plan templates (wrap generated plans)
  - Verification templates (wrap review comments)
  - Review templates (wrap code review comments)
  - User query templates (wrap direct queries)
- **Template Variables**:
  - `{{planMarkdown}}`: Generated plan content
  - `{{comments}}`: Verification/review comments
  - `{{userQuery}}`: User query
  - `{{basePrompt}}`: Generic base prompt

### 4.6 Configuration Management
- **Global Config** (`~/.sdd-tool/config.yaml`):
  - Default LLM provider
  - API keys
  - Default model profiles
  - Agent configurations
  - Template paths
- **Project Config** (`.sdd-tool/config.yaml`):
  - Project-specific overrides
  - Custom CLI agents
  - Workflow definitions
  - MCP server configurations (optional)
- **Environment Variables**:
  - `SDD_API_KEY_*`: API keys
  - `SDD_CONFIG_PATH`: Custom config path
  - `SDD_DATA_PATH`: Custom data directory

### 4.7 CLI Interface

#### 4.7.1 Commands Structure
```
sdd <command> [options]

Commands:
  plan <query>          Create a new plan task
  phases <query>         Create a new phases task
  review <query>          Review code changes
  epic <query>           Create an epic (with workflow)
  exec <task-id>         Execute a task
  verify <task-id>       Verify a task
  history                View task history
  config                 Manage configuration
  agent                  Manage agents
  template               Manage templates
  workflow               Manage workflows
```

#### 4.7.2 Interactive Mode
- TUI-based task creation and management
- Terminal-based plan editor
- Rich output with colors and formatting
- Progress indicators for long operations

### 4.8 Security & Privacy
- **Local-First**: All data stored locally by default
- **API Key Management**: Secure storage (system keychain when available)
- **No Telemetry**: Optional, opt-in only
- **Git Privacy**: Respect .gitignore for sensitive data
- **Privacy Mode**: Never upload code to external services (except LLM API calls)

---

## 5. Integration Requirements

### 5.1 AGENTS.md Support
- **Detection**: Automatically find AGENTS.md files
- **Parsing**: Extract and use project-specific instructions
- **Traversal**: Search from file location up to workspace root
- **Monorepo Support**: Use nearest AGENTS.md for nested projects

### 5.2 MCP Support (Model Context Protocol)
- **Remote MCP Servers**: Connect to external MCP endpoints
- **Tool Registration**: Register MCP tools for agent use
- **Authentication**:
  - No auth (public endpoints)
  - API Key authentication
  - OAuth (optional, v2)
- **Tool Management**: Enable/disable specific MCP tools

### 5.3 IDE Integration (Optional)
- **VS Code Extension**:
  - Command palette integration
  - Sidebar panel for tasks
  - Editor decorations for plan references
- **Cursor Integration**:
  - Similar to VS Code
  - Leverage existing agent capabilities

### 5.4 External Tool Integration
- **Code Analysis**:
  - ESLint/TSLint for code quality
  - Prettier for code formatting
  - Type checkers (TypeScript, mypy)
- **Testing**:
  - npm test / pytest / go test integration
  - Auto-run tests after verification
- **Documentation**:
  - Generate docs from specs
  - Update README from PRDs

---

## 6. Data Model Requirements

### 6.1 Task Schema
```typescript
interface Task {
  id: string;
  type: 'plan' | 'phases' | 'review' | 'epic';
  query: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  context: {
    files: string[];
    folders: string[];
    gitRef?: string;
    images?: string[];
  };
  plan?: Plan;
  phases?: Phase[];
  review?: Review;
  epic?: Epic;
  history: TaskHistory[];
}

interface Plan {
  id: string;
  steps: PlanStep[];
  mermaidDiagram?: string;
  rationale: string;
  iterations: PlanIteration[];
}

interface Phase {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  plan?: Plan;
  execution?: Execution;
  verification?: Verification;
}
```

### 6.2 Verification Schema
```typescript
interface Verification {
  id: string;
  taskId: string;
  timestamp: Date;
  comments: VerificationComment[];
  summary: string;
}

interface VerificationComment {
  id: string;
  category: 'critical' | 'major' | 'minor' | 'outdated';
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
  status: 'open' | 'fixed' | 'ignored';
}
```

### 6.3 Epic Schema
```typescript
interface Epic {
  id: string;
  workflow?: Workflow;
  specs: Spec[];
  tickets: Ticket[];
  executions: Execution[];
}

interface Spec {
  id: string;
  type: 'prd' | 'tech' | 'design' | 'api';
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: 'todo' | 'in_progress' | 'done';
  linkedSpecs: string[];
  assignee?: string;
}
```

---

## 7. Performance Requirements

### 7.1 Response Times
- Plan generation: < 30 seconds (for typical project)
- Plan iteration: < 10 seconds
- Verification: < 20 seconds
- Search: < 1 second
- Task load: < 500ms

### 7.2 Scalability
- Support projects with up to 10,000 files
- Handle task history with 1,000+ tasks
- Context windows up to 200K tokens
- Efficient incremental updates

### 7.3 Resource Usage
- Memory: < 500MB idle, < 2GB during operations
- Disk: < 100MB for core application
- Network: Minimal (only LLM API calls)

---

## 8. Usability Requirements

### 8.1 Learnability
- Clear error messages with actionable suggestions
- Built-in help documentation
- Tutorial for first-time users
- Example commands and workflows

### 8.2 Error Handling
- Graceful degradation when features unavailable
- Retry logic for transient failures
- Clear distinction between user errors and system errors
- Stack traces in debug mode only

### 8.3 Accessibility
- Keyboard-only navigation
- High contrast mode support
- Screen reader compatibility (for TUI)

---

## 9. Extensibility Requirements

### 9.1 Plugin System (Future)
- Plugin API for custom task types
- Custom verification rules
- Custom integrations

### 9.2 Workflow Customization
- User-defined workflows
- Custom commands
- Template-based workflow generation

### 9.3 LLM Provider Extensibility
- Standard interface for LLM providers
- Easy addition of new providers
- Provider-specific features (tools, streaming, etc.)

---

## 10. Non-Functional Requirements

### 10.1 Reliability
- 99% uptime for local operations
- Automatic recovery from crashes
- Data integrity guarantees

### 10.2 Maintainability
- Clean code architecture
- Comprehensive logging
- Modular design
- Well-documented APIs

### 10.3 Portability
- Cross-platform (Windows, macOS, Linux)
- Node.js 18+ compatibility
- No platform-specific dependencies

### 10.4 Compatibility
- Git 2.0+
- npm/yarn/pnpm integration
- Support for popular languages (TypeScript, Python, Go, Rust, etc.)

---

## 11. MVP Scope (Minimum Viable Product)

### Phase 1: Core Functionality
- [ ] Plan Mode with basic plan generation
- [ ] Agent handoff (Claude Code CLI)
- [ ] Basic verification (Critical/Major/Minor comments)
- [ ] Task history with local storage
- [ ] CLI interface with basic commands

### Phase 2: Enhanced Features
- [ ] Phases Mode with multi-phase management
- [ ] Review Mode with code analysis
- [ ] Custom CLI agents
- [ ] Template system
- [ ] AGENTS.md support

### Phase 3: Advanced Features
- [ ] Epic Mode with specs and tickets
- [ ] Workflow system
- [ ] Mermaid diagram generation
- [ ] MCP support
- [ ] Git integration (diff, auto-commit)

### Phase 4: Polish & Integration
- [ ] VS Code extension
- [ ] Rich TUI interface
- [ ] Comprehensive documentation
- [ ] Error handling improvements
- [ ] Performance optimizations

---

## 12. Success Metrics

- User adoption: 100+ GitHub stars in first month
- Task success rate: > 85% of tasks complete without blocking issues
- User retention: > 60% return users after first week
- Verification effectiveness: > 70% of issues caught before manual review
- Community engagement: > 20 issues/PRs in first month

---

## Appendix A: Use Cases

### Use Case 1: Adding a Feature
1. User runs: `sdd plan "Add user authentication with OAuth2"`
2. Tool analyzes codebase and generates implementation plan
3. User reviews and refines plan through chat
4. User runs: `sdd exec <task-id>`
5. Tool hands off to Claude Code CLI with plan
6. Agent implements the feature
7. User runs: `sdd verify <task-id>`
8. Tool verifies implementation and reports issues
9. User fixes issues (automatically or manually)
10. Task completes successfully

### Use Case 2: Complex Multi-Phase Project
1. User runs: `sdd phases "Build e-commerce platform"`
2. Tool breaks project into phases (backend, frontend, integration)
3. User executes phases sequentially with context preservation
4. Tool maintains state across all phases
5. Project completes with all phases verified

### Use Case 3: Code Review
1. User runs: `sdd review --against main`
2. Tool analyzes all changes against main branch
3. Tool generates categorized review comments
4. User addresses issues systematically
5. Code quality improves

---

## Appendix B: Technical Constraints

- Must run locally (no cloud dependency except LLM APIs)
- Must respect user privacy (no data collection without consent)
- Must be open source (MIT or Apache 2.0 license)
- Must have comprehensive documentation
- Must follow open source best practices (CONTRIBUTING.md, CODE_OF_CONDUCT.md)
