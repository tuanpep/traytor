import chalk from 'chalk';

const COMMAND_DOCS: Record<string, string> = {
  config: `${chalk.bold('traytor config <subcommand> [provider] [apiKey]')}
${chalk.dim('─────────────────────────────────────────────────')}

Manage configuration and securely store API keys.

${chalk.bold('Subcommands:')}
  show                     Show current configuration
  set-key <provider> <key> Securely store an API key
  get-key <provider>       Show a stored API key (masked)
  remove-key <provider>    Remove a stored API key

${chalk.bold('Examples:')}
  traytor config show
  traytor config set-key anthropic sk-ant-...
  traytor config get-key openai
  traytor config remove-key anthropic

${chalk.bold('Note:')}
  API keys are stored in the system keychain when available
  (macOS Keychain, Linux secret-service). Falls back to encrypted
  file storage at ~/.traytor/keys/ when keychain is unavailable.`,

  plan: `${chalk.bold('traytor plan <query>')}
${chalk.dim('─────────────────────────────────────────────────')}

Generate an implementation plan for a task using AI.

${chalk.bold('Usage:')}
  traytor plan "Implement user authentication with JWT"

${chalk.bold('Options:')}
  -f, --files <files...>   Specific files to include in analysis
  -o, --output <format>    Output format: terminal, markdown, json (default: terminal)
  --output-file <path>     Write output to a file
  -v, --verbose            Show verbose output

${chalk.bold('Examples:')}
  traytor plan "Add pagination to user list API"
  traytor plan "Refactor auth module" --files src/auth.ts src/middleware.ts
  traytor plan "Build CRUD API" --output markdown --output-file plan.md

${chalk.bold('How it works:')}
  1. Analyzes relevant files in the project
  2. Sends context + query to the LLM provider
  3. Generates a structured plan with steps, files, and rationale
  4. Saves the task for later execution and verification`,

  phases: `${chalk.bold('traytor phases <query>')}
${chalk.dim('─────────────────────────────────────────────────')}

Break a complex task into sequential phases with dependencies.

${chalk.bold('Usage:')}
  traytor phases "Build a complete REST API"

${chalk.bold('Options:')}
  -f, --files <files...>   Specific files to include in analysis
  -o, --output <format>    Output format: terminal, markdown, json (default: terminal)
  -v, --verbose            Show verbose output

${chalk.bold('Examples:')}
  traytor phases "Build an e-commerce platform"
  traytor phases "Migrate database to PostgreSQL" --files src/db/*

${chalk.bold('How it works:')}
  1. Analyzes the project structure and codebase
  2. Generates phases with clear boundaries and dependencies
  3. Each phase gets its own plan for execution
  4. Execute phases individually with \`traytor exec <task-id> --phase <n>\`

${chalk.bold('Phase management:')}
  traytor phases:list <task-id>          List phases for a task
  traytor phases:add <task-id>           Add a new phase
    --name <name>                    Phase name (required)
    --description <desc>             Phase description
    --after <n>                      Insert after phase number
  traytor phases:insert <task-id>        Insert a phase at a specific position
    --name <name>                    Phase name (required)
    --insert-after <n>               Insert after this phase
  traytor phases:reorder <task-id>       Reorder phases
    --from <n> --to <n>              Move phase from position to position
  traytor phases:delete <task-id>        Delete a phase
    --phase <n>                      Phase number to delete`,

  exec: `${chalk.bold('traytor exec <task-id>')}
${chalk.dim('─────────────────────────────────────────────────')}

Execute a task with an AI agent.

${chalk.bold('Usage:')}
  traytor exec task_abc123

${chalk.bold('Options:')}
  --cwd <path>         Working directory for the agent
  --timeout <ms>       Timeout in milliseconds
  --phase <n>          Execute a specific phase (for phases tasks)
  --agent <name>       Use a specific agent by name
  --template <name>    Use a specific template by name
  -v, --verbose        Show verbose output

${chalk.bold('Examples:')}
  traytor exec task_abc123
  traytor exec task_abc123 --phase 1
  traytor exec task_abc123 --agent claude --timeout 600000`,

  verify: `${chalk.bold('traytor verify <task-id>')}
${chalk.dim('─────────────────────────────────────────────────')}

Verify a task implementation against its plan.

${chalk.bold('Usage:')}
  traytor verify task_abc123

${chalk.bold('Options:')}
  --cwd <path>              Working directory to analyze
  --phase <n>               Verify a specific phase
  --mode <mode>             Verification mode: fresh, reverify
  --fix-comment <id>        Fix a specific verification comment
  --fix-comment-status <s>  Status for fixed comment (resolved, acknowledged)
  --fix                     Fix all verification comments via agent
  --fix-comment-ids <ids>   Comma-separated comment IDs to fix
  --fix-all                 Fix all blocking comments
  --batch-size <n>          Number of comments to fix per batch
  --agent <name>            Agent name for fix execution
  --severity <sev>          Severity filter (critical, major, minor)
  --dry-run                 Show what would be fixed without running
  -v, --verbose             Show verbose output

${chalk.bold('Output:')}
  Verification results are categorized as:
    ${chalk.red('critical')} - Must fix before proceeding
    ${chalk.yellow('major')}    - Should fix
    ${chalk.blue('minor')}    - Nice to have improvements
    ${chalk.gray('outdated')} - Plan references outdated code

${chalk.bold('Examples:')}
  traytor verify task_abc123
  traytor verify task_abc123 --phase 1
  traytor verify task_abc123 --fix --agent claude
  traytor verify task_abc123 --mode reverify`,

  review: `${chalk.bold('traytor review <query>')}
${chalk.dim('─────────────────────────────────────────────────')}

Run an agentic code review with AI.

${chalk.bold('Usage:')}
  traytor review "Focus on security and error handling"

${chalk.bold('Options:')}
  -f, --files <files...>    Specific files to review
  --against <ref>           Git ref to compare against (e.g., main)
  -o, --output <format>     Output format: terminal, markdown, json
  --output-file <path>      Write output to a file
  --cwd <path>              Working directory to analyze
  --fix                     Fix review comments via agent
  --fix-comment-ids <ids>   Comma-separated comment IDs to fix
  --fix-template <name>     Template for fix prompt
  -v, --verbose             Show verbose output

${chalk.bold('Examples:')}
  traytor review "Check for security issues" --against main
  traytor review "Performance review" --files src/api/*.ts
  traytor review --fix task_abc123 --fix-comment-ids rcomment_1,rcomment_2`,

  epic: `${chalk.bold('traytor epic <query>')}
${chalk.dim('─────────────────────────────────────────────────')}

Start an epic with AI elicitation, or manage specs/tickets.

${chalk.bold('Usage:')}
  traytor epic "Build an e-commerce platform"

${chalk.bold('Spec management:')}
  traytor epic --task-id <id> --spec list
  traytor epic --task-id <id> --spec create --spec-type tech --spec-title "Architecture"
  traytor epic --task-id <id> --spec edit --spec-id <id> --spec-title "New title"

${chalk.bold('Ticket management:')}
  traytor epic --task-id <id> --ticket list
  traytor epic --task-id <id> --ticket create --ticket-title "User auth"
  traytor epic --task-id <id> --ticket status --ticket-id <id> --ticket-status in_progress

${chalk.bold('Options:')}
  --task-id <id>            Task ID of an existing epic
  --spec <sub>              Spec subcommand: list, create, edit
  --spec-type <type>        Spec type: prd, tech, design, api
  --ticket <sub>            Ticket subcommand: list, create, edit, status
  --max-rounds <n>          Max elicitation rounds
  --auto                    Skip interactive elicitation
  -o, --output <format>     Output format: terminal, markdown, json
  -v, --verbose             Show verbose output`,

  workflow: `${chalk.bold('traytor workflow <subcommand> [name]')}
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
  traytor workflow list
  traytor workflow create dev-flow --steps "Plan,Execute,Verify"
  traytor workflow state wf_abc123`,

  git: `${chalk.bold('traytor git <subcommand> [arg]')}
${chalk.dim('─────────────────────────────────────────────────')}

Git operations integrated with Traytor workflow tracking.

${chalk.bold('Subcommands:')}
  status                   Show git status
  diff [ref]               Show git diff (optionally against a ref)
  commit <message>         Stage and commit changes

${chalk.bold('Options:')}
  --files <files...>       Specific files to commit

${chalk.bold('Examples:')}
  traytor git status
  traytor git diff main
  traytor git commit "feat: add user authentication" --files src/auth.ts`,

  agent: `${chalk.bold('traytor agent <subcommand> [name]')}
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
  traytor agent list
  traytor agent add claude --command "claude" --args "--dangerously-skip-permissions"
  traytor agent set-default claude`,

  template: `${chalk.bold('traytor template <subcommand> [name]')}
${chalk.dim('─────────────────────────────────────────────────')}

Manage prompt templates for AI interactions.

${chalk.bold('Subcommands:')}
  list                     List all available templates
  show <name>              Show a template's content
  create <name>            Create a new template
  edit <name>              Edit an existing template

${chalk.bold('Examples:')}
  traytor template list
  traytor template show plan
  traytor template create my-template --content "Custom prompt..."`,

  history: `${chalk.bold('traytor history')}
${chalk.dim('─────────────────────────────────────────────────')}

View task history with filtering and output options.

${chalk.bold('Usage:')}
  traytor history

${chalk.bold('Options:')}
  -o, --output <format>    Output format: terminal, json (default: terminal)
  --status <status>        Filter by status (pending, in_progress, completed, failed)
  --type <type>            Filter by task type (plan, phases, epic, exec, review)
  --limit <n>              Limit number of results

${chalk.bold('Examples:')}
  traytor history
  traytor history --output json
  traytor history --status completed --limit 5`,

  yolo: `${chalk.bold('traytor yolo <task-id>')}
${chalk.dim('─────────────────────────────────────────────────')}

Execute all phases of a task automatically (plan → exec → verify).

${chalk.bold('Usage:')}
  traytor yolo task_abc123

${chalk.bold('Options:')}
  --from-phase <n>         Start from phase number
  --to-phase <n>           End at phase number
  --skip-planning          Skip plan generation, use existing plans
  --agent <name>           Execution agent name
  --plan-agent <name>      Planning agent name
  --verify-agent <name>    Verification agent name
  --no-verify              Skip verification
  --verify-severity <sev>  Severity levels to check (critical, major, minor)
  --auto-commit            Auto-commit after each phase
  --commit-msg <msg>       Commit message template
  --timeout <ms>           Execution timeout in milliseconds
  --max-retries <n>        Max retries per phase
  --dry-run                Show what would be executed without running
  -v, --verbose            Show verbose output

${chalk.bold('Examples:')}
  traytor yolo task_abc123
  traytor yolo task_abc123 --from-phase 2 --to-phase 4
  traytor yolo task_abc123 --dry-run`,

  'ticket-assist': `${chalk.bold('traytor ticket-assist <subcommand> <owner> <repo>')}
${chalk.dim('─────────────────────────────────────────────────')}

GitHub issue integration - list, plan, and track tickets.

${chalk.bold('Subcommands:')}
  list <owner> <repo>      List open issues from a repository
  plan <owner> <repo>      Create a plan from a GitHub issue
  show <owner> <repo>      Show issue details

${chalk.bold('Options:')}
  --issue-number <n>       GitHub issue number (required for plan/show)
  --label <label>          Filter issues by label

${chalk.bold('Examples:')}
  traytor ticket-assist list myorg myrepo
  traytor ticket-assist plan myorg myrepo --issue-number 42
  traytor ticket-assist show myorg myrepo --issue-number 42

${chalk.bold('Note:')}
  Set GITHUB_TOKEN environment variable for authentication.`,

  mermaid: `${chalk.bold('traytor mermaid <subcommand> [task-id]')}
${chalk.dim('─────────────────────────────────────────────────')}

Generate Mermaid diagrams from tasks, plans, and phases.

${chalk.bold('Subcommands:')}
  show [task-id]           Display a Mermaid diagram
  url [task-id]            Get live editor and image URLs
  export [task-id]         Export diagram to a file
  generate <task-id>       Generate diagram from task plan
  validate --input <code>  Validate Mermaid syntax

${chalk.bold('Options:')}
  --task-id <id>           Task ID (alternative to argument)
  --output <path>          Output file path (for export)
  --input <code>           Mermaid code (for validate)

${chalk.bold('Examples:')}
  traytor mermaid show task_abc123
  traytor mermaid url task_abc123
  traytor mermaid export task_abc123 --output diagram.mmd
  traytor mermaid validate --input "graph TD; A-->B;"`,

  tui: `${chalk.bold('traytor tui')}
${chalk.dim('─────────────────────────────────────────────────')}

Launch the interactive terminal UI for task management.

${chalk.bold('Usage:')}
  traytor tui

Provides a visual interface to browse, filter, and manage tasks.`,

  'model-profile': `${chalk.bold('traytor model-profile <subcommand> [profile]')}
${chalk.dim('─────────────────────────────────────────────────')}

Manage AI model profiles for different task types.

${chalk.bold('Subcommands:')}
  list                     List all available model profiles
  show <profile>           Show profile details
  set <profile>            Set the active model profile

${chalk.bold('Examples:')}
  traytor model-profile list
  traytor model-profile show balanced
  traytor model-profile set frontier`,

  usage: `${chalk.bold('traytor usage [task-id]')}
${chalk.dim('─────────────────────────────────────────────────')}

View token usage statistics for tasks.

${chalk.bold('Usage:')}
  traytor usage               Show total usage across all tasks
  traytor usage task_abc123   Show usage for a specific task

${chalk.bold('Output:')}
  Shows input tokens, output tokens, total tokens, and estimated cost.`,
};

export function runHelpCommand(command?: string): void {
  if (!command) {
    console.log('');
    console.log(chalk.bold.cyan('Traytor - Spec Driven Development CLI'));
    console.log('');
    console.log(chalk.bold('Commands:'));
    console.log('');
    const commands = Object.keys(COMMAND_DOCS);
    for (const cmd of commands) {
      const description = COMMAND_DOCS[cmd]!.split('\n')[0]!.replace(chalk.bold(''), '');
      console.log(
        `  ${chalk.yellow(cmd.padEnd(12))} ${chalk.dim(description.replace(/^traytor/, ''))}`
      );
    }
    console.log('');
    console.log(chalk.dim('Run `traytor help <command>` for detailed documentation.'));
    console.log('');
    return;
  }

  const doc = COMMAND_DOCS[command];
  if (!doc) {
    console.error(chalk.red(`Unknown command: ${command}`));
    console.log(chalk.dim(`Run \`traytor help\` to see available commands.`));
    process.exit(1);
  }

  console.log('');
  console.log(doc);
  console.log('');
}
