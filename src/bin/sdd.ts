import { Command } from 'commander';
import { initLogger, getLogger } from '../utils/logger.js';
import { bootstrap, type AppContext } from '../app/bootstrap.js';
import { runPlanCommand } from '../commands/plan.js';
import { runExecCommand } from '../commands/exec.js';
import { runVerifyCommand } from '../commands/verify.js';
import { runHistoryCommand } from '../commands/history.js';

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

// ─── Exec Command ──────────────────────────────────────────────────────────

program
  .command('exec')
  .description('Execute a task with an AI agent')
  .argument('<task-id>', 'Task ID to execute')
  .option('--cwd <path>', 'Working directory for the agent')
  .option('--timeout <ms>', 'Timeout in milliseconds')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (taskId: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runExecCommand(ctx.taskService, ctx.agentService, taskId, {
        cwd: opts.cwd,
        timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
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
  .option('-v, --verbose', 'Show verbose output')
  .action(async (taskId: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runVerifyCommand(ctx.taskService, ctx.verifier, taskId, {
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
