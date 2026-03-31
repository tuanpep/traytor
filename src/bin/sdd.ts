import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { initLogger, getLogger } from '../utils/logger.js';
import { bootstrap, type AppContext } from '../app/bootstrap.js';
import { runPlanCommand } from '../commands/plan.js';
import { runExecCommand } from '../commands/exec.js';
import { runVerifyCommand } from '../commands/verify.js';
import { runHistoryCommand } from '../commands/history.js';
import { runPhasesCommand } from '../commands/phases.js';
import { runReviewCommand } from '../commands/review.js';
import { runAgentList, runAgentAdd, runAgentRemove, runAgentSetDefault } from '../commands/agent.js';
import { runTemplateList, runTemplateShow, runTemplateCreate, runTemplateEdit } from '../commands/template.js';

const program = new Command();

program.name('sdd').description('Personal Spec-Driven Development CLI Tool').version('0.1.0');

program
  .command('hello')
  .description('Test command to verify the CLI is working')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      const logger = getLogger();
      logger.debug('Verbose mode enabled');
      logger.info('SDD Tool is running!');

      console.log('');
      console.log('  Configuration loaded successfully:');
      console.log(`    Provider:   ${ctx.config.provider}`);
      console.log(`    Model:      ${ctx.config.anthropic.model}`);
      console.log(`    Data dir:   ${ctx.config.dataDir}`);
      console.log(`    Log level:  ${ctx.config.logLevel}`);
      console.log(`    Agents:     ${ctx.config.agents.length} configured`);
      console.log('');
      console.log('  Everything is working correctly.');
      console.log('');
    } catch (err) {
      handleError(err);
    }
  });

// ─── Plan Command ──────────────────────────────────────────────────────────

program
  .command('plan')
  .description('Generate an implementation plan for a task')
  .argument('<query>', 'Task description to plan')
  .option('-f, --files <files...>', 'Specific files to include in analysis')
  .option('-o, --output <format>', 'Output format: terminal, clipboard, markdown, json', 'terminal')
  .option('--output-file <path>', 'Write output to a file (for markdown/json)')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (query: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runPlanCommand(ctx.taskService, query, {
        files: opts.files,
        output: opts.output,
        outputFile: opts.outputFile,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Phases Command ─────────────────────────────────────────────────────────

program
  .command('phases')
  .description('Break a complex task into sequential phases')
  .argument('<query>', 'Task description to break into phases')
  .option('-f, --files <files...>', 'Specific files to include in analysis')
  .option('-o, --output <format>', 'Output format: terminal, markdown, json', 'terminal')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (query: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runPhasesCommand(ctx.taskService, query, {
        files: opts.files,
        output: opts.output,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Exec Command ──────────────────────────────────────────────────────────

program
  .command('exec')
  .description('Execute a task with an AI agent')
  .argument('<task-id>', 'Task ID to execute')
  .option('--cwd <path>', 'Working directory for the agent')
  .option('--timeout <ms>', 'Timeout in milliseconds')
  .option('--phase <n>', 'Execute a specific phase (for phases tasks)', parseInt)
  .option('--agent <name>', 'Use a specific agent by name')
  .option('--template <name>', 'Use a specific template by name')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (taskId: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runExecCommand(ctx.taskService, ctx.agentService, taskId, {
        cwd: opts.cwd,
        timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
        phase: opts.phase,
        agent: opts.agent,
        template: opts.template,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Verify Command ────────────────────────────────────────────────────────

program
  .command('verify')
  .description('Verify a task implementation against its plan')
  .argument('<task-id>', 'Task ID to verify')
  .option('--cwd <path>', 'Working directory to analyze')
  .option('--phase <n>', 'Verify a specific phase (for phases tasks)', parseInt)
  .option('-v, --verbose', 'Show verbose output')
  .action(async (taskId: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runVerifyCommand(ctx.taskService, ctx.verifier, taskId, {
        cwd: opts.cwd,
        phase: opts.phase,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Review Command ────────────────────────────────────────────────────────

program
  .command('review')
  .description('Run an agentic code review')
  .argument('<query>', 'Review description or focus area')
  .option('-f, --files <files...>', 'Specific files to review')
  .option('--against <ref>', 'Git ref to compare against (e.g., main, HEAD~3)')
  .option('-o, --output <format>', 'Output format: terminal, markdown, json', 'terminal')
  .option('--output-file <path>', 'Write output to a file (for markdown/json)')
  .option('--cwd <path>', 'Working directory to analyze')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (query: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runReviewCommand(ctx.taskService, ctx.reviewGenerator, query, {
        against: opts.against,
        files: opts.files,
        output: opts.output,
        outputFile: opts.outputFile,
        cwd: opts.cwd,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── History Command ───────────────────────────────────────────────────────

program
  .command('history')
  .description('View task history')
  .action(async () => {
    try {
      const ctx = await getContext();
      initLogger({ level: ctx.config.logLevel });

      await runHistoryCommand(ctx.taskService);
    } catch (err) {
      handleError(err);
    }
  });

// ─── Agent Command ─────────────────────────────────────────────────────────

function getProjectConfigDir(): string {
  return path.join(process.cwd(), '.sdd-tool');
}

program
  .command('agent')
  .description('Manage custom CLI agents')
  .argument('<subcommand>', 'Subcommand: list, add, remove, set-default')
  .argument('[name]', 'Agent name (for add, remove, set-default)')
  .option('--command <command>', 'Agent command (for add)')
  .option('--args <args...>', 'Agent arguments (for add)')
  .option('--shell <shell>', 'Shell type: bash or powershell (for add)', 'bash')
  .option('--env <env...>', 'Environment variables KEY=VALUE (for add)')
  .option('--timeout <ms>', 'Timeout in milliseconds (for add)')
  .option('--set-default', 'Set as default agent (for add)')
  .action(async (subcommand: string, name: string | undefined, opts) => {
    try {
      const ctx = { projectConfigDir: getProjectConfigDir() };
      initLogger({ level: 'info' });

      switch (subcommand) {
        case 'list':
          runAgentList(ctx);
          break;
        case 'add': {
          if (!name) {
            console.error(chalk.red('Agent name is required for add.'));
            process.exit(1);
          }
          if (!opts.command) {
            console.error(chalk.red('--command is required for add.'));
            process.exit(1);
          }
          const env: Record<string, string> = {};
          if (opts.env) {
            for (const entry of opts.env) {
              const eqIndex = entry.indexOf('=');
              if (eqIndex > 0) {
                env[entry.slice(0, eqIndex)] = entry.slice(eqIndex + 1);
              }
            }
          }
          runAgentAdd(ctx, name, {
            command: opts.command,
            args: opts.args,
            shell: opts.shell,
            env: Object.keys(env).length > 0 ? env : undefined,
            timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
            setDefault: opts.setDefault,
          });
          break;
        }
        case 'remove': {
          if (!name) {
            console.error(chalk.red('Agent name is required for remove.'));
            process.exit(1);
          }
          runAgentRemove(ctx, name);
          break;
        }
        case 'set-default': {
          if (!name) {
            console.error(chalk.red('Agent name is required for set-default.'));
            process.exit(1);
          }
          runAgentSetDefault(ctx, name);
          break;
        }
        default:
          console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
          console.log(chalk.dim('Available subcommands: list, add, remove, set-default'));
          process.exit(1);
      }
    } catch (err) {
      handleError(err);
    }
  });

// ─── Template Command ──────────────────────────────────────────────────────

program
  .command('template')
  .description('Manage prompt templates')
  .argument('<subcommand>', 'Subcommand: list, show, create, edit')
  .argument('[name]', 'Template name (for show, create, edit)')
  .option('--content <content>', 'Template content (for create)')
  .action(async (subcommand: string, name: string | undefined, opts) => {
    try {
      const ctx = { projectConfigDir: getProjectConfigDir() };
      initLogger({ level: 'info' });

      switch (subcommand) {
        case 'list':
          await runTemplateList(ctx);
          break;
        case 'show': {
          if (!name) {
            console.error(chalk.red('Template name is required for show.'));
            process.exit(1);
          }
          await runTemplateShow(ctx, name);
          break;
        }
        case 'create': {
          if (!name) {
            console.error(chalk.red('Template name is required for create.'));
            process.exit(1);
          }
          await runTemplateCreate(ctx, name, opts.content);
          break;
        }
        case 'edit': {
          if (!name) {
            console.error(chalk.red('Template name is required for edit.'));
            process.exit(1);
          }
          await runTemplateEdit(ctx, name, opts.content);
          break;
        }
        default:
          console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
          console.log(chalk.dim('Available subcommands: list, show, create, edit'));
          process.exit(1);
      }
    } catch (err) {
      handleError(err);
    }
  });

// ─── Helpers ───────────────────────────────────────────────────────────────

let _context: AppContext | null = null;

async function getContext(): Promise<AppContext> {
  if (!_context) {
    _context = await bootstrap();
  }
  return _context;
}

function handleError(err: unknown): void {
  const logger = getLogger();
  if (err instanceof Error) {
    logger.error(err.message);
    if ('suggestion' in err) {
      console.error(`  Suggestion: ${(err as { suggestion: string }).suggestion}`);
    }
  } else {
    logger.error(String(err));
  }
  process.exit(1);
}

program.parse();
