import chalk from 'chalk';

const COMMAND_DOCS: Record<string, string> = {
  config: `${chalk.bold('sdd config <subcommand> [provider] [apiKey]')}
${chalk.dim('─────────────────────────────────────────────────')}

Manage configuration and securely store API keys.

${chalk.bold('Subcommands:')}
  show                     Show current configuration
  set-key <provider> <key> Securely store an API key
  get-key <provider>       Show a stored API key (masked)
  remove-key <provider>    Remove a stored API key

${chalk.bold('Examples:')}
  sdd config show
  sdd config set-key anthropic sk-ant-...
  sdd config get-key openai
  sdd config remove-key anthropic

${chalk.bold('Note:')}
  API keys are stored in the system keychain when available
  (macOS Keychain, Linux secret-service). Falls back to encrypted
  file storage at ~/.sdd-tool/keys/ when keychain is unavailable.`,

  plan: `${chalk.bold('sdd plan <query>')}
${chalk.dim('─────────────────────────────────────────────────')}

Generate an implementation plan for a task using AI.

${chalk.bold('Usage:')}
  sdd plan "Implement user authentication with JWT"

${chalk.bold('Options:')}
  -f, --files <files...>   Specific files to include in analysis
  -o, --output <format>    Output format: terminal, markdown, json (default: terminal)
  --output-file <path>     Write output to a file
  -v, --verbose            Show verbose output

${chalk.bold('Examples:')}
  sdd plan "Add pagination to user list API"
  sdd plan "Refactor auth module" --files src/auth.ts src/middleware.ts
  sdd plan "Build CRUD API" --output markdown --output-file plan.md

${chalk.bold('How it works:')}
  1. Analyzes relevant files in the project
  2. Sends context + query to the LLM provider
  3. Generates a structured plan with steps, files, and rationale
  4. Saves the task for later execution and verification`,

  phases: `${chalk.bold('sdd phases <query>')}
${chalk.dim('─────────────────────────────────────────────────')}

Break a complex task into sequential phases with dependencies.

${chalk.bold('Usage:')}
  sdd phases "Build a complete REST API"

${chalk.bold('Options:')}
  -f, --files <files...>   Specific files to include in analysis
  -o, --output <format>    Output format: terminal, markdown, json (default: terminal)
  -v, --verbose            Show verbose output

${chalk.bold('Examples:')}
  sdd phases "Build an e-commerce platform"
  sdd phases "Migrate database to PostgreSQL" --files src/db/*

${chalk.bold('How it works:')}
  1. Analyzes the project structure and codebase
  2. Generates phases with clear boundaries and dependencies
  3. Each phase gets its own plan for execution
  4. Execute phases individually with \`sdd exec <task-id> --phase <n>\``,

  exec: `${chalk.bold('sdd exec <task-id>')}
${chalk.dim('─────────────────────────────────────────────────')}

Execute a task with an AI agent.

${chalk.bold('Usage:')}
  sdd exec task_abc123

${chalk.bold('Options:')}
  --cwd <path>         Working directory for the agent
  --timeout <ms>       Timeout in milliseconds
  --phase <n>          Execute a specific phase (for phases tasks)
  --agent <name>       Use a specific agent by name
  --template <name>    Use a specific template by name
  -v, --verbose        Show verbose output

${chalk.bold('Examples:')}
  sdd exec task_abc123
  sdd exec task_abc123 --phase 1
  sdd exec task_abc123 --agent claude --timeout 600000`,

  verify: `${chalk.bold('sdd verify <task-id>')}
${chalk.dim('─────────────────────────────────────────────────')}

Verify a task implementation against its plan.

${chalk.bold('Usage:')}
  sdd verify task_abc123

${chalk.bold('Options:')}
  --cwd <path>         Working directory to analyze
  --phase <n>          Verify a specific phase
  -v, --verbose        Show verbose output

${chalk.bold('Output:')}
  Verification results are categorized as:
    ${chalk.red('critical')} - Must fix before proceeding
    ${chalk.yellow('major')}    - Should fix
    ${chalk.blue('minor')}    - Nice to have improvements
    ${chalk.gray('outdated')} - Plan references outdated code

${chalk.bold('Examples:')}
  sdd verify task_abc123
  sdd verify task_abc123 --phase 1`,

  review: `${chalk.bold('sdd review <query>')}
${chalk.dim('─────────────────────────────────────────────────')}

Run an agentic code review with AI.

${chalk.bold('Usage:')}
  sdd review "Focus on security and error handling"

${chalk.bold('Options:')}
  -f, --files <files...>    Specific files to review
  --against <ref>           Git ref to compare against (e.g., main)
  -o, --output <format>     Output format: terminal, markdown, json
  --output-file <path>      Write output to a file
  --cwd <path>              Working directory to analyze
  -v, --verbose             Show verbose output

${chalk.bold('Examples:')}
  sdd review "Check for security issues" --against main
  sdd review "Performance review" --files src/api/*.ts`,

  epic: `${chalk.bold('sdd epic <query>')}
${chalk.dim('─────────────────────────────────────────────────')}

Start an epic with AI elicitation, or manage specs/tickets.

${chalk.bold('Usage:')}
  sdd epic "Build an e-commerce platform"

${chalk.bold('Spec management:')}
  sdd epic --task-id <id> --spec list
  sdd epic --task-id <id> --spec create --spec-type tech --spec-title "Architecture"
  sdd epic --task-id <id> --spec edit --spec-id <id> --spec-title "New title"

${chalk.bold('Ticket management:')}
  sdd epic --task-id <id> --ticket list
  sdd epic --task-id <id> --ticket create --ticket-title "User auth"
  sdd epic --task-id <id> --ticket status --ticket-id <id> --ticket-status in_progress

${chalk.bold('Options:')}
  --task-id <id>            Task ID of an existing epic
  --spec <sub>              Spec subcommand: list, create, edit
  --spec-type <type>        Spec type: prd, tech, design, api
  --ticket <sub>            Ticket subcommand: list, create, edit, status
  --max-rounds <n>          Max elicitation rounds
  --auto                    Skip interactive elicitation
  -o, --output <format>     Output format: terminal, markdown, json
  -v, --verbose             Show verbose output`,

  workflow: `${chalk.bold('sdd workflow <subcommand> [name]')}
${chalk.dim('─────────────────────────────────────────────────')}

Manage workflows and workflow state.

${chalk.bold('Subcommands:')}
  list                     List all workflow definitions
  show <name>              Show a workflow definition
  create <name>            Create a new workflow
  state <id>               Show workflow execution state
  advance <id>             Advance to the next step
  pause <id>               Pause a running workflow
  resume <id>              Resume a paused workflow

${chalk.bold('Examples:')}
  sdd workflow list
  sdd workflow create dev-flow --steps "Plan,Execute,Verify"
  sdd workflow state wf_abc123`,

  git: `${chalk.bold('sdd git <subcommand> [arg]')}
${chalk.dim('─────────────────────────────────────────────────')}

Git operations integrated with SDD workflow tracking.

${chalk.bold('Subcommands:')}
  status                   Show git status
  diff [ref]               Show git diff (optionally against a ref)
  commit <message>         Stage and commit changes

${chalk.bold('Options:')}
  --files <files...>       Specific files to commit

${chalk.bold('Examples:')}
  sdd git status
  sdd git diff main
  sdd git commit "feat: add user authentication" --files src/auth.ts`,

  agent: `${chalk.bold('sdd agent <subcommand> [name]')}
${chalk.dim('─────────────────────────────────────────────────')}

Manage custom CLI agents for task execution.

${chalk.bold('Subcommands:')}
  list                     List all configured agents
  add <name>               Add a new agent
  remove <name>            Remove an agent
  set-default <name>       Set the default agent

${chalk.bold('Options for add:')}
  --command <command>      Agent command
  --args <args...>         Agent arguments
  --shell <shell>          Shell type: bash or powershell (default: bash)
  --env <env...>           Environment variables KEY=VALUE
  --timeout <ms>           Timeout in milliseconds
  --set-default            Set as default agent

${chalk.bold('Examples:')}
  sdd agent list
  sdd agent add claude --command "claude" --args "--dangerously-skip-permissions"
  sdd agent set-default claude`,

  template: `${chalk.bold('sdd template <subcommand> [name]')}
${chalk.dim('─────────────────────────────────────────────────')}

Manage prompt templates for AI interactions.

${chalk.bold('Subcommands:')}
  list                     List all available templates
  show <name>              Show a template's content
  create <name>            Create a new template
  edit <name>              Edit an existing template

${chalk.bold('Examples:')}
  sdd template list
  sdd template show plan
  sdd template create my-template --content "Custom prompt..."`,

  history: `${chalk.bold('sdd history')}
${chalk.dim('─────────────────────────────────────────────────')}

View task history with status information.

${chalk.bold('Usage:')}
  sdd history

Shows all tasks with their IDs, status, and descriptions.`,
};

export function runHelpCommand(command?: string): void {
  if (!command) {
    console.log('');
    console.log(chalk.bold.cyan('SDD - Spec Driven Development CLI'));
    console.log('');
    console.log(chalk.bold('Commands:'));
    console.log('');
    const commands = Object.keys(COMMAND_DOCS);
    for (const cmd of commands) {
      const description = COMMAND_DOCS[cmd].split('\n')[0].replace(chalk.bold(''), '');
      console.log(`  ${chalk.yellow(cmd.padEnd(12))} ${chalk.dim(description.replace(/^sdd /, ''))}`);
    }
    console.log('');
    console.log(chalk.dim('Run `sdd help <command>` for detailed documentation.'));
    console.log('');
    return;
  }

  const doc = COMMAND_DOCS[command];
  if (!doc) {
    console.error(chalk.red(`Unknown command: ${command}`));
    console.log(chalk.dim(`Run \`sdd help\` to see available commands.`));
    process.exit(1);
  }

  console.log('');
  console.log(doc);
  console.log('');
}
