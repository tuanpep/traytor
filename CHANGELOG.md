# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `traytor doctor` command — health check for configuration, API keys, agents, git repo, and storage
- `traytor task list` command — list tasks with status/type filtering and JSON output
- `traytor task show <id>` command — display detailed task info including plan, phases, verification, and executions
- `traytor exec --safe-mode` flag — runs agent without `--dangerously-skip-permissions`
- New error classes: `MCPConnectionError`, `MCPToolError`, `ConfigValidationError`, `AgentTimeoutError`
- MCP client automatic retry with exponential backoff on 429/5xx errors
- MCP client `reconnect()` method for reconnection to last server
- `AgentTimeoutError` thrown when agent process times out (instead of generic error)
- 23 new tests: MCP client (13), agent service (4), error classes (6)
- VS Code extension: workflow state, pause, resume commands
- VS Code extension: epic spec creation, ticket listing, ticket status, epic board commands

### Changed
- `hello` command deprecated in favor of `traytor doctor`
- VS Code extension: replaced deny-list input validation with allow-list pattern
- VS Code extension: workflow advance now prompts for workflow ID
- ESLint: added `prefer-nullish-coalescing` and `strict-boolean-expressions` rules

### Fixed
- MCP client now uses proper `MCPConnectionError` and `MCPToolError` instead of generic `LLM_API_ERROR`
- MCP client `ensureConnected` throws specific error with actionable suggestion

## [0.1.0] - 2026-03-31

### Added

- Initial project scaffolding with TypeScript, tsup, and pnpm
- Configuration system with YAML config files and environment variable overrides
- Zod schema validation for all configuration
- Task data models and file-based storage layer
- LLM integration with Anthropic and OpenAI providers
- Model profiles for per-task-type model selection (balanced, frontier, custom)
- File analyzer with code symbol extraction
- Context manager for task-aware code analysis
- Plan generation with Handlebars template engine
- Phase mode for multi-phase task management
- Task execution with AI agent support
- Verification system for code vs plan comparison
- Code review generation with categorized findings
- Epic mode with AI-guided elicitation, specs, and tickets
- Custom CLI agent management (list, add, remove, set-default)
- Prompt template system (list, show, create, edit)
- Workflow engine with state management
- Git integration (status, diff, commit)
- MCP (Model Context Protocol) client support
- Built-in help system via Commander.js
- VS Code extension with command palette, sidebar, and output channel
- Secure API key storage with system keychain integration and encrypted file fallback
- Cross-platform support (macOS, Linux, Windows)
- LLM API retry logic with exponential backoff for transient failures
- Comprehensive error handling with actionable suggestions
- Color-coded CLI output with chalk
- Logger system with configurable log levels
