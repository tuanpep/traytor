# Contributing to Traytor

Thank you for your interest in contributing to Traytor! This guide covers how to set up the development environment and contribute code.

## Development Setup

### Prerequisites

- Node.js >= 18
- pnpm >= 10
- TypeScript 5.x
- An LLM API key (Anthropic or OpenAI) for testing

### Steps

```bash
# Clone the repository
git clone https://github.com/tuanpep/traytor.git && cd traytor

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test

# Run linter
pnpm lint

# Check formatting
pnpm format:check
```

### Development Mode

```bash
# Run CLI in development mode (no build needed)
pnpm dev hello -v
pnpm dev plan "test task"
```

## Project Structure

```
src/
  bin/           CLI entry point and command definitions
  commands/      Command handler implementations
  config/        Configuration schema, defaults, and loader
  core/          File analysis, context management, verification
  data/          Repositories, storage, validation schemas
  integrations/  LLM providers (Anthropic, OpenAI), MCP client
  models/        TypeScript type definitions
  services/      Business logic services
  templates/     Handlebars prompt templates
  ui/            Output formatting
  utils/         Logger, errors, platform utilities
extension/       VS Code extension
tests/           Unit and integration tests
```

## Coding Standards

- **TypeScript strict mode** is enabled
- Follow existing code patterns and conventions
- Use ES module imports (`.js` extension in import paths)
- Use `chalk` for CLI output formatting
- Use `TraytorError` and its subclasses for error handling with actionable suggestions

## Adding a New Command

1. Create a command handler in `src/commands/`
2. Register the command in `src/bin/traytor.ts`
3. Add corresponding service methods if needed
4. Add tests in `tests/`
5. Update this README if the command changes user-facing behavior

## Testing

Tests use [Vitest](https://vitest.dev/):

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/unit/my-test.test.ts

# Run tests in watch mode
pnpm test:watch
```

## Commit Messages

Follow conventional commit format:

```
feat: add new plan generation feature
fix: resolve task ID parsing error
docs: update README installation instructions
refactor: simplify LLM provider interface
test: add integration tests for verify command
```

## Reporting Issues

When reporting issues, please include:

- Node.js and pnpm versions
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Relevant log output (use `traytor <command> -v` for verbose output)
