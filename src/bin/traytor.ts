import 'dotenv/config';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { initLogger, getLogger } from '../utils/logger.js';
import { TraytorError, ErrorCode } from '../utils/errors.js';
import { bootstrap, type AppContext } from '../app/bootstrap.js';
import { runPlanCommand } from '../commands/plan.js';
import { runExecCommand } from '../commands/exec.js';
import { runVerifyCommand } from '../commands/verify.js';
import { runHistoryCommand } from '../commands/history.js';
import {
  runPhasesCommand,
  runPhasesListCommand,
  runPhaseAddCommand,
  runPhaseInsertCommand,
  runPhaseReorderCommand,
  runPhaseDeleteCommand,
} from '../commands/phases.js';
import { runReviewCommand } from '../commands/review.js';
import {
  runAgentList,
  runAgentAdd,
  runAgentRemove,
  runAgentSetDefault,
} from '../commands/agent.js';
import {
  runTemplateList,
  runTemplateShow,
  runTemplateCreate,
  runTemplateEdit,
} from '../commands/template.js';
import {
  runWorkflowList,
  runWorkflowShow,
  runWorkflowCreate,
  runWorkflowState,
  runWorkflowAdvance,
  runWorkflowPause,
  runWorkflowResume,
  runGitStatus,
  runGitDiff,
  runGitCommit,
} from '../commands/workflow.js';
import {
  runModelProfileList,
  runModelProfileShow,
  runModelProfileSet,
} from '../commands/model-profile.js';
import { runUsageCommand } from '../commands/usage.js';
import {
  runEpicCommand,
  runSpecListCommand,
  runSpecCreateCommand,
  runSpecEditCommand,
  runTicketListCommand,
  runTicketCreateCommand,
  runTicketStatusCommand,
  runTicketEditCommand,
} from '../commands/epic.js';
import { runHelpCommand } from '../commands/help.js';
import { runTUICommand } from '../commands/tui.js';
import { resolveVersion } from '../utils/version.js';

const pkgVersion = resolveVersion();

const program = new Command();

program
  .name('traytor')
  .description('Personal Spec-Driven Development CLI Tool')
  .version(pkgVersion);

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
      logger.info('Traytor is running!');

      console.log('');
      const currentModel =
        ctx.config.provider === 'anthropic' ? ctx.config.anthropic.model : ctx.config.openai.model;
      console.log('  Configuration loaded successfully:');
      console.log(`    Provider:   ${ctx.config.provider}`);
      console.log(`    Model:      ${currentModel}`);
      if (ctx.config.openai.baseURL) {
        console.log(`    Base URL:   ${ctx.config.openai.baseURL}`);
      }
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
  .alias('p')
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

// ─── Phase List Command ─────────────────────────────────────────────────────

program
  .command('phases:list')
  .description('List all phases for a task')
  .argument('<task-id>', 'Task ID of a phases task')
  .action(async (taskId: string) => {
    try {
      const ctx = await getContext();
      await runPhasesListCommand(ctx.taskService, taskId);
    } catch (err) {
      handleError(err);
    }
  });

// ─── Phase Add Command ───────────────────────────────────────────────────────

program
  .command('phases:add')
  .description('Add a new phase to a task')
  .argument('<task-id>', 'Task ID of a phases task')
  .option('--name <name>', 'Name of the new phase (required)')
  .option('--description <text>', 'Description of the phase')
  .action(async (taskId: string, opts) => {
    try {
      const ctx = await getContext();
      await runPhaseAddCommand(ctx.taskService, taskId, {
        name: opts.name,
        description: opts.description,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Phase Insert Command ───────────────────────────────────────────────────

program
  .command('phases:insert')
  .description('Insert a new phase after a specific phase')
  .argument('<task-id>', 'Task ID of a phases task')
  .option('--name <name>', 'Name of the new phase (required)')
  .option('--description <text>', 'Description of the phase')
  .option('--insert-after <n>', 'Insert after phase N (required)', parseInt)
  .action(async (taskId: string, opts) => {
    try {
      const ctx = await getContext();
      await runPhaseInsertCommand(ctx.taskService, taskId, {
        name: opts.name,
        description: opts.description,
        insertAfter: opts.insertAfter,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Phase Reorder Command ──────────────────────────────────────────────────

program
  .command('phases:reorder')
  .description('Reorder phases by specifying new order of phase IDs')
  .argument('<task-id>', 'Task ID of a phases task')
  .argument('<phase-ids...>', 'Phase IDs in new order (e.g., id1 id2 id3)')
  .action(async (taskId: string, phaseIds: string[]) => {
    try {
      const ctx = await getContext();
      await runPhaseReorderCommand(ctx.taskService, taskId, phaseIds);
    } catch (err) {
      handleError(err);
    }
  });

// ─── Phase Delete Command ───────────────────────────────────────────────────

program
  .command('phases:delete')
  .description('Delete a phase from a task')
  .argument('<task-id>', 'Task ID of a phases task')
  .argument('<phase-order>', 'Phase order (1-based) to delete', parseInt)
  .action(async (taskId: string, phaseOrder: number) => {
    try {
      const ctx = await getContext();
      await runPhaseDeleteCommand(ctx.taskService, taskId, phaseOrder);
    } catch (err) {
      handleError(err);
    }
  });

// ─── YOLO Command ──────────────────────────────────────────────────────────

import { runYOLOCommand } from '../commands/yolo.js';

program
  .command('yolo')
  .description('Run automated phase execution (YOLO mode)')
  .argument('<task-id>', 'Task ID of a phases task to execute')
  .option('--from-phase <n>', 'Start from phase N', parseInt)
  .option('--to-phase <n>', 'End at phase N', parseInt)
  .option('--skip-planning', 'Skip plan generation for each phase')
  .option('--agent <name>', 'Agent to use for execution')
  .option('--plan-agent <name>', 'Agent to use for planning')
  .option('--verify-agent <name>', 'Agent to use for verification')
  .option('--no-verify', 'Skip verification after each phase')
  .option(
    '--verify-severity <levels>',
    'Severity levels to verify (comma-separated: critical,major,minor)'
  )
  .option('--plan-template <name>', 'Template for plan generation')
  .option('--verify-template <name>', 'Template for verification')
  .option('--auto-commit', 'Auto-commit after each phase')
  .option('--commit-msg <template>', 'Commit message template')
  .option('--timeout <ms>', 'Execution timeout in milliseconds')
  .option('--max-retries <n>', 'Max retries per phase', parseInt)
  .option('--parallel', 'Execute phases in parallel (for independent phases)')
  .option('--dry-run', 'Show what would happen without executing')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (taskId: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runYOLOCommand(
        {
          taskService: ctx.taskService,
          planGenerator: ctx.planGenerator,
          agentService: ctx.agentService,
          verifier: ctx.verifier,
          gitService: ctx.gitService,
          yoloConfig: ctx.config.yolo,
        },
        taskId,
        {
          fromPhase: opts.fromPhase,
          toPhase: opts.toPhase,
          skipPlanning: opts.skipPlanning,
          executionAgent: opts.agent,
          planAgent: opts.planAgent,
          verifyAgent: opts.verifyAgent,
          noVerify: opts.noVerify,
          verifySeverity: opts.verifySeverity?.split(',').map((s: string) => s.trim()),
          planTemplate: opts.planTemplate,
          verifyTemplate: opts.verifyTemplate,
          autoCommit: opts.autoCommit,
          commitMessage: opts.commitMsg,
          timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
          maxRetries: opts.maxRetries,
          dryRun: opts.dryRun,
          parallel: opts.parallel,
        }
      );
    } catch (err) {
      handleError(err);
    }
  });

// ─── Exec Command ──────────────────────────────────────────────────────────

program
  .command('exec')
  .alias('e')
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
  .alias('v')
  .description('Verify a task implementation against its plan')
  .argument('<task-id>', 'Task ID to verify')
  .option('--cwd <path>', 'Working directory to analyze')
  .option('--phase <n>', 'Verify a specific phase (for phases tasks)', parseInt)
  .option('--mode <mode>', 'Verification mode: fresh (default) or reverify', 'fresh')
  .option('--fix-comment <id>', 'Mark a verification comment as fixed or ignored')
  .option('--fix-comment-status <status>', 'Status for --fix-comment: fixed or ignored', 'fixed')
  .option('--fix', 'Fix verification comments using an agent')
  .option('--fix-comment-ids <ids>', 'Comma-separated comment IDs to fix')
  .option('--fix-all', 'Fix all blocking comments')
  .option('--batch-size <n>', 'Batch size for fixing comments', parseInt)
  .option('--agent <name>', 'Agent to use for fixing')
  .option('--severity <levels>', 'Severity levels to fix (comma-separated: critical,major,minor)')
  .option('--dry-run', 'Dry run for fix operations')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (taskId: string, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runVerifyCommand(ctx.taskService, ctx.verifier, ctx.agentService, taskId, {
        cwd: opts.cwd,
        phase: opts.phase,
        mode: opts.mode as 'fresh' | 'reverify',
        fixComment: opts.fixComment,
        fixCommentStatus: opts.fixCommentStatus as 'fixed' | 'ignored',
        fix: opts.fix,
        fixCommentIds: opts.fixCommentIds,
        fixAll: opts.fixAll,
        batchSize: opts.batchSize,
        agent: opts.agent,
        severity: opts.severity,
        dryRun: opts.dryRun,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Review Command ────────────────────────────────────────────────────────

program
  .command('review')
  .description('Run an agentic code review')
  .argument('[query]', 'Review description or focus area (omit with --fix to fix existing review)')
  .option('-f, --files <files...>', 'Specific files to review')
  .option('--against <ref>', 'Git ref to compare against (e.g., main, HEAD~3)')
  .option('-o, --output <format>', 'Output format: terminal, markdown, json', 'terminal')
  .option('--output-file <path>', 'Write output to a file (for markdown/json)')
  .option('--cwd <path>', 'Working directory to analyze')
  .option('--fix', 'Fix mode: send review comments to agent for fixing')
  .option('--task-id <id>', 'Task ID (required for --fix mode)')
  .option('--fix-comment-ids <ids>', 'Comma-separated comment IDs to fix')
  .option('--fix-template <name>', 'Template for fix prompt')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (query: string | undefined, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      await runReviewCommand(ctx.taskService, ctx.reviewGenerator, query || '', {
        against: opts.against,
        files: opts.files,
        output: opts.output,
        outputFile: opts.outputFile,
        cwd: opts.cwd,
        fix: opts.fix,
        fixCommentIds: opts.fixCommentIds,
        fixTemplate: opts.fixTemplate,
        agentService: ctx.agentService,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── History Command ───────────────────────────────────────────────────────

program
  .command('history')
  .alias('h')
  .description('View task history')
  .option('-o, --output <format>', 'Output format: terminal, json', 'terminal')
  .option('--status <status>', 'Filter by status')
  .option('--type <type>', 'Filter by task type')
  .option('--limit <n>', 'Limit number of results', parseInt)
  .action(async (opts) => {
    try {
      const ctx = await getContext();
      initLogger({ level: ctx.config.logLevel });

      await runHistoryCommand(ctx.taskService, {
        output: opts.output,
        status: opts.status,
        type: opts.type,
        limit: opts.limit,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Agent Command ─────────────────────────────────────────────────────────

function getProjectConfigDir(): string {
  return path.join(process.cwd(), '.traytor');
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

// ─── Ticket Assist Command ─────────────────────────────────────────────────

program
  .command('ticket-assist')
  .description('GitHub issue integration - list, plan, and track tickets')
  .argument('[subcommand]', 'Subcommand: list, plan, show')
  .argument('[owner]', 'GitHub owner/org')
  .argument('[repo]', 'GitHub repository')
  .option('--issue-number <n>', 'GitHub issue number', parseInt)
  .option('--label <label>', 'Filter issues by label')
  .option('--task-id <id>', 'Task ID to link with')
  .action(
    async (
      subcommand: string | undefined,
      owner: string | undefined,
      repo: string | undefined,
      opts
    ) => {
      try {
        const ctx = await getContext();
        const { runTicketAssist } = await import('../commands/ticket-assist.js');
        await runTicketAssist(
          {
            planGenerator: ctx.planGenerator,
            taskService: ctx.taskService,
          },
          subcommand || 'list',
          owner || '',
          repo || '',
          opts
        );
      } catch (err) {
        handleError(err);
      }
    }
  );

// ─── Mermaid Command ───────────────────────────────────────────────────────

program
  .command('mermaid')
  .description('Generate Mermaid diagrams from tasks, plans, and phases')
  .argument('[subcommand]', 'Subcommand: show, export, url, generate, validate')
  .argument('[taskId]', 'Task ID to generate diagram for')
  .option('--format <format>', 'Output format: mermaid, png, svg', 'mermaid')
  .option('--output <path>', 'Output file path')
  .option('--type <type>', 'Diagram type: flowchart, sequence, class')
  .option('--task-id <id>', 'Task ID (alternative to argument)')
  .action(async (subcommand: string | undefined, taskId: string | undefined, opts) => {
    try {
      const { MermaidService } = await import('../services/mermaid-service.js');
      const mermaidService = new MermaidService();
      const mermaidCtx = { mermaidService };
      const targetTaskId = taskId || opts.taskId || '';

      let mermaidCode = '';
      if (targetTaskId) {
        const ctx = await getContext();
        const task = await ctx.taskService.getTask(targetTaskId);
        if (task.plan) {
          mermaidCode = mermaidService.generateDiagramFromPlan({
            steps: task.plan.steps.map((s) => ({ title: s.title, description: s.description })),
          });
        } else if (task.phases && task.phases.length > 0) {
          const lines = ['graph TD', `  Start[Task: ${task.query}]`];
          task.phases.forEach((p, i) => {
            const prev = i === 0 ? 'Start' : `P${task.phases![i - 1]!.order}`;
            lines.push(`  P${p.order}[Phase ${p.order}: ${p.name}]`);
            lines.push(`  ${prev} --> P${p.order}`);
          });
          mermaidCode = lines.join('\n');
        } else {
          mermaidCode = `graph TD\n  A[Task: ${task.query}] --> B[No plan or phases yet]`;
        }
      } else {
        mermaidCode = `graph TD\n  A[No task specified] --> B[Use: traytor mermaid show <task-id>]`;
      }

      switch (subcommand || 'show') {
        case 'show': {
          const { runMermaidShow } = await import('../commands/mermaid.js');
          await runMermaidShow(mermaidCtx, mermaidCode);
          break;
        }
        case 'url': {
          const { runMermaidUrl } = await import('../commands/mermaid.js');
          await runMermaidUrl(mermaidCtx, mermaidCode);
          break;
        }
        case 'export': {
          const { runMermaidExport } = await import('../commands/mermaid.js');
          await runMermaidExport(mermaidCtx, mermaidCode, opts.output || 'diagram.mmd');
          break;
        }
        case 'generate': {
          const { runMermaidGenerate } = await import('../commands/mermaid.js');
          if (!targetTaskId) {
            console.error(
              chalk.red('Task ID required for generate. Use: traytor mermaid generate <task-id>')
            );
            return;
          }
          const ctx = await getContext();
          const task = await ctx.taskService.getTask(targetTaskId);
          if (!task.plan) {
            console.error(chalk.red('Task has no plan to generate diagram from.'));
            return;
          }
          await runMermaidGenerate(mermaidCtx, task.plan.steps, opts.output);
          break;
        }
        case 'validate': {
          const { runMermaidValidate } = await import('../commands/mermaid.js');
          if (!opts.input) {
            console.error(
              chalk.red(
                'Input required for validate. Use: traytor mermaid validate --input "<code>"'
              )
            );
            return;
          }
          await runMermaidValidate(mermaidCtx, opts.input);
          break;
        }
        default:
          console.error(
            chalk.red(
              `Unknown subcommand: ${subcommand}. Use: show, url, export, generate, validate`
            )
          );
      }
    } catch (err) {
      handleError(err);
    }
  });

// ─── Epic Command ──────────────────────────────────────────────────────────

program
  .command('epic')
  .description('Start an epic with AI elicitation, or manage specs/tickets')
  .argument('[query]', 'Epic description (omit to manage existing epic)')
  .option('--task-id <id>', 'Task ID of an existing epic (for spec/ticket management)')
  .option('--spec <subcommand>', 'Spec subcommand: list, create, edit')
  .option('--spec-id <id>', 'Spec ID (for edit)')
  .option('--spec-type <type>', 'Spec type: prd, tech, design, api')
  .option('--spec-title <title>', 'Spec title (for create/edit)')
  .option('--ticket <subcommand>', 'Ticket subcommand: list, create, edit, status')
  .option('--ticket-id <id>', 'Ticket ID (for edit/status)')
  .option('--ticket-title <title>', 'Ticket title (for create/edit)')
  .option('--ticket-description <desc>', 'Ticket description (for create/edit)')
  .option('--ticket-status <status>', 'New ticket status: todo, in_progress, done')
  .option('--max-rounds <n>', 'Max elicitation rounds', parseInt)
  .option('--auto', 'Skip interactive elicitation, use defaults')
  .option('-o, --output <format>', 'Output format: terminal, markdown, json', 'terminal')
  .option('--output-file <path>', 'Write output to a file (for markdown/json)')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (query: string | undefined, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      const taskId = opts.taskId;

      // Spec sub-commands
      if (opts.spec) {
        if (!taskId) {
          console.error(chalk.red('--task-id is required for spec operations'));
          process.exit(1);
        }
        switch (opts.spec) {
          case 'list':
            await runSpecListCommand(ctx.epicService, taskId);
            break;
          case 'create':
            await runSpecCreateCommand(
              ctx.epicService,
              taskId,
              (opts.specType as 'prd' | 'tech' | 'design' | 'api') ?? 'prd',
              opts.specTitle,
              opts.specTitle ? '# ' + opts.specTitle + '\n\n' : undefined
            );
            break;
          case 'edit':
            if (!opts.specId) {
              console.error(chalk.red('--spec-id is required for edit'));
              process.exit(1);
            }
            await runSpecEditCommand(ctx.epicService, taskId, opts.specId, {
              title: opts.specTitle,
            });
            break;
          default:
            console.error(chalk.red(`Unknown spec subcommand: ${opts.spec}`));
            console.log(chalk.dim('Available: list, create, edit'));
            process.exit(1);
        }
        return;
      }

      // Ticket sub-commands
      if (opts.ticket) {
        if (!taskId) {
          console.error(chalk.red('--task-id is required for ticket operations'));
          process.exit(1);
        }
        switch (opts.ticket) {
          case 'list':
            await runTicketListCommand(ctx.epicService, taskId);
            break;
          case 'create':
            await runTicketCreateCommand(
              ctx.epicService,
              taskId,
              opts.ticketTitle,
              opts.ticketDescription
            );
            break;
          case 'edit':
            if (!opts.ticketId) {
              console.error(chalk.red('--ticket-id is required for edit'));
              process.exit(1);
            }
            await runTicketEditCommand(ctx.epicService, taskId, opts.ticketId, {
              title: opts.ticketTitle,
              description: opts.ticketDescription,
            });
            break;
          case 'status':
            if (!opts.ticketId || !opts.ticketStatus) {
              console.error(chalk.red('--ticket-id and --ticket-status are required'));
              process.exit(1);
            }
            await runTicketStatusCommand(ctx.epicService, taskId, opts.ticketId, opts.ticketStatus);
            break;
          default:
            console.error(chalk.red(`Unknown ticket subcommand: ${opts.ticket}`));
            console.log(chalk.dim('Available: list, create, edit, status'));
            process.exit(1);
        }
        return;
      }

      // Main epic creation
      if (!query) {
        console.error(chalk.red('A query is required to start a new epic'));
        console.log(chalk.dim('Usage: traytor epic "Build auth system"'));
        console.log(chalk.dim('       traytor epic --task-id <id> --spec list'));
        console.log(chalk.dim('       traytor epic --task-id <id> --ticket list'));
        process.exit(1);
      }

      await runEpicCommand(ctx.epicService, ctx.epicGenerator, query, {
        maxRounds: opts.maxRounds,
        auto: opts.auto,
        output: opts.output,
        outputFile: opts.outputFile,
      });
    } catch (err) {
      handleError(err);
    }
  });

// ─── Workflow Command ──────────────────────────────────────────────────────

program
  .command('workflow')
  .description('Manage workflows and workflow state')
  .argument('<subcommand>', 'Subcommand: list, show, create, state, advance, pause, resume')
  .argument(
    '[nameOrId]',
    'Workflow name (for show, create) or workflow ID (for state, advance, pause, resume)'
  )
  .option('--description <desc>', 'Workflow description (for create)')
  .option('--steps <steps>', 'Comma-separated step names (for create)')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (subcommand: string, nameOrId: string | undefined, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      const wfCtx = {
        workflowEngine: ctx.workflowEngine,
        gitService: ctx.gitService,
      };

      switch (subcommand) {
        case 'list':
          await runWorkflowList(wfCtx);
          break;
        case 'show': {
          if (!nameOrId) {
            console.error(chalk.red('Workflow name is required for show.'));
            process.exit(1);
          }
          await runWorkflowShow(wfCtx, nameOrId);
          break;
        }
        case 'create': {
          if (!nameOrId) {
            console.error(chalk.red('Workflow name is required for create.'));
            process.exit(1);
          }
          await runWorkflowCreate(wfCtx, nameOrId, {
            description: opts.description,
            steps: opts.steps,
          });
          break;
        }
        case 'state': {
          if (!nameOrId) {
            console.error(chalk.red('Workflow ID is required for state.'));
            process.exit(1);
          }
          await runWorkflowState(wfCtx, nameOrId);
          break;
        }
        case 'advance': {
          if (!nameOrId) {
            console.error(chalk.red('Workflow ID is required for advance.'));
            process.exit(1);
          }
          await runWorkflowAdvance(wfCtx, nameOrId);
          break;
        }
        case 'pause': {
          if (!nameOrId) {
            console.error(chalk.red('Workflow ID is required for pause.'));
            process.exit(1);
          }
          await runWorkflowPause(wfCtx, nameOrId);
          break;
        }
        case 'resume': {
          if (!nameOrId) {
            console.error(chalk.red('Workflow ID is required for resume.'));
            process.exit(1);
          }
          await runWorkflowResume(wfCtx, nameOrId);
          break;
        }
        default:
          console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
          console.log(
            chalk.dim('Available subcommands: list, show, create, state, advance, pause, resume')
          );
          process.exit(1);
      }
    } catch (err) {
      handleError(err);
    }
  });

// ─── Git Command ──────────────────────────────────────────────────────────

program
  .command('git')
  .description('Git operations (status, diff, commit)')
  .argument('<subcommand>', 'Subcommand: status, diff, commit')
  .argument('[arg]', 'Git ref for diff, or commit message for commit')
  .option('--files <files...>', 'Files to commit')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (subcommand: string, arg: string | undefined, opts) => {
    try {
      const ctx = await getContext();
      const logLevel = opts.verbose ? 'debug' : ctx.config.logLevel;
      initLogger({ level: logLevel });

      const wfCtx = {
        workflowEngine: ctx.workflowEngine,
        gitService: ctx.gitService,
      };

      switch (subcommand) {
        case 'status':
          await runGitStatus(wfCtx);
          break;
        case 'diff':
          await runGitDiff(wfCtx, arg);
          break;
        case 'commit': {
          if (!arg) {
            console.error(chalk.red('Commit message is required.'));
            process.exit(1);
          }
          await runGitCommit(wfCtx, arg, opts.files);
          break;
        }
        default:
          console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
          console.log(chalk.dim('Available subcommands: status, diff, commit'));
          process.exit(1);
      }
    } catch (err) {
      handleError(err);
    }
  });

// ─── TUI Command ───────────────────────────────────────────────────────────

program
  .command('tui')
  .description('Open interactive Terminal UI dashboard')
  .action(async () => {
    try {
      const ctx = await getContext();
      initLogger({ level: ctx.config.logLevel });

      await runTUICommand(ctx.taskService);
    } catch (err) {
      handleError(err);
    }
  });

// ─── Help Command ──────────────────────────────────────────────────────────

program
  .command('help')
  .description('Show detailed help for a command')
  .argument('[command]', 'Command to show help for')
  .action(async (command?: string) => {
    runHelpCommand(command);
  });

// ─── Config Command ────────────────────────────────────────────────────────

program
  .command('config')
  .description('Manage configuration and API keys')
  .argument('<subcommand>', 'Subcommand: show, set-key, get-key, remove-key')
  .argument('[provider]', 'Provider name (for key subcommands): anthropic, openai')
  .argument('[apiKey]', 'API key value (for set-key)')
  .action(async (subcommand: string, provider: string | undefined, apiKey: string | undefined) => {
    try {
      initLogger({ level: 'info' });

      const { runConfigCommand, runConfigSetKey, runConfigGetKey, runConfigRemoveKey } =
        await import('../commands/config.js');

      switch (subcommand) {
        case 'show': {
          const ctx = await getContext();
          runConfigCommand(ctx.config);
          break;
        }
        case 'set-key': {
          if (!provider || !apiKey) {
            console.error(chalk.red('Provider and API key are required for set-key.'));
            console.log(chalk.dim('Usage: traytor config set-key <provider> <api-key>'));
            process.exit(1);
          }
          await runConfigSetKey(provider, apiKey);
          break;
        }
        case 'get-key': {
          if (!provider) {
            console.error(chalk.red('Provider is required for get-key.'));
            console.log(chalk.dim('Usage: traytor config get-key <provider>'));
            process.exit(1);
          }
          await runConfigGetKey(provider);
          break;
        }
        case 'remove-key': {
          if (!provider) {
            console.error(chalk.red('Provider is required for remove-key.'));
            console.log(chalk.dim('Usage: traytor config remove-key <provider>'));
            process.exit(1);
          }
          await runConfigRemoveKey(provider);
          break;
        }
        default:
          console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
          console.log(chalk.dim('Available subcommands: show, set-key, get-key, remove-key'));
          process.exit(1);
      }
    } catch (err) {
      handleError(err);
    }
  });

// ─── Model Profile Command ──────────────────────────────────────────────────

program
  .command('model-profile')
  .description('Manage model profiles')
  .argument('<subcommand>', 'Subcommand: list, show, set')
  .argument('[name]', 'Profile name (for show, set)')
  .option('--type <type>', 'Task type for set: plan, verify, review')
  .action(async (subcommand: string, name: string | undefined, opts) => {
    try {
      const ctx = await getContext();
      initLogger({ level: 'info' });

      const profileCtx = { config: ctx.config };

      switch (subcommand) {
        case 'list':
          await runModelProfileList(profileCtx);
          break;
        case 'show': {
          if (!name) {
            console.error(chalk.red('Profile name is required for show.'));
            process.exit(1);
          }
          await runModelProfileShow(profileCtx, name);
          break;
        }
        case 'set': {
          if (!name) {
            console.error(chalk.red('Profile name is required for set.'));
            process.exit(1);
          }
          await runModelProfileSet(profileCtx, opts.type || 'default', name);
          break;
        }
        default:
          console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
          console.log(chalk.dim('Available subcommands: list, show, set'));
          process.exit(1);
      }
    } catch (err) {
      handleError(err);
    }
  });

// ─── Usage Command ────────────────────────────────────────────────────────

program
  .command('usage')
  .description('Show token usage statistics')
  .argument('[task-id]', 'Task ID to show usage for (omit for total usage)')
  .action(async (taskId: string | undefined) => {
    try {
      const ctx = await getContext();
      initLogger({ level: 'info' });

      await runUsageCommand(ctx.taskService, taskId);
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

const ERROR_EXIT_CODES: Record<ErrorCode, number> = {
  [ErrorCode.TASK_NOT_FOUND]: 10,
  [ErrorCode.PLAN_GENERATION_FAILED]: 11,
  [ErrorCode.AGENT_EXECUTION_FAILED]: 12,
  [ErrorCode.VERIFICATION_FAILED]: 13,
  [ErrorCode.CONFIG_INVALID]: 14,
  [ErrorCode.FILE_NOT_FOUND]: 15,
  [ErrorCode.LLM_API_ERROR]: 16,
  [ErrorCode.TEMPLATE_ERROR]: 17,
  [ErrorCode.PHASE_NOT_FOUND]: 20,
  [ErrorCode.PHASE_GENERATION_FAILED]: 21,
  [ErrorCode.EPIC_NOT_FOUND]: 30,
  [ErrorCode.SPEC_NOT_FOUND]: 31,
  [ErrorCode.TICKET_NOT_FOUND]: 32,
  [ErrorCode.EPIC_GENERATION_FAILED]: 33,
  [ErrorCode.GIT_ERROR]: 40,
  [ErrorCode.WORKFLOW_ERROR]: 50,
  [ErrorCode.WORKFLOW_NOT_FOUND]: 51,
  [ErrorCode.WORKFLOW_STATE_ERROR]: 52,
  [ErrorCode.REVIEW_FAILED]: 60,
};

function handleError(err: unknown): void {
  const logger = getLogger();
  if (err instanceof TraytorError) {
    logger.error(err.message);
    console.error(chalk.red(`${err.name} [${err.code}]: ${err.message}`));
    if (err.suggestion) {
      console.error(chalk.dim(`  Suggestion: ${err.suggestion}`));
    }
    if (err.details) {
      logger.debug('Error details:', err.details);
    }
    const exitCode = ERROR_EXIT_CODES[err.code] ?? 1;
    process.exit(exitCode);
  } else if (err instanceof Error) {
    logger.error(err.message);
    if (err.stack) logger.debug(err.stack);
    console.error(chalk.red(err.message));
  } else {
    logger.error(String(err));
    console.error(chalk.red(String(err)));
  }
  process.exit(1);
}

program.parse();
