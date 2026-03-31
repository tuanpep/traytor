import chalk from 'chalk';
import type { WorkflowEngine } from '../services/workflow-engine.js';
import type { GitService } from '../services/git-service.js';
import type { WorkflowDefinition, WorkflowState } from '../models/workflow.js';

export interface WorkflowCommandContext {
  workflowEngine: WorkflowEngine;
  gitService?: GitService;
}

// ─── Workflow List ───────────────────────────────────────────────────────

export async function runWorkflowList(ctx: WorkflowCommandContext): Promise<void> {
  const workflows = ctx.workflowEngine.listWorkflows();

  if (workflows.length === 0) {
    console.log(chalk.dim('No workflows found.'));
    return;
  }

  console.log(chalk.bold.cyan(`Workflows (${workflows.length}):`));
  console.log('');

  for (const workflow of workflows) {
    const isBuiltIn = ctx.workflowEngine.isBuiltIn(workflow.name);
    const tag = isBuiltIn ? chalk.green('[built-in]') : chalk.gray('[custom]');
    console.log(`  ${chalk.bold(workflow.name)} ${tag}`);
    if (workflow.description) {
      console.log(chalk.dim(`    ${workflow.description}`));
    }
    const stepsStr = workflow.steps
      .map((s) => {
        const hints = s.argumentHints?.length
          ? `(${s.argumentHints.map((h) => h.name).join(', ')})`
          : '';
        return `${s.name}${hints}`;
      })
      .join(' → ');
    console.log(chalk.dim(`    Steps: ${stepsStr}`));
    console.log('');
  }
}

// ─── Workflow Show ───────────────────────────────────────────────────────

export async function runWorkflowShow(ctx: WorkflowCommandContext, name: string): Promise<void> {
  try {
    const workflow = ctx.workflowEngine.getWorkflow(name);
    console.log(formatWorkflowDefinition(workflow, ctx));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// ─── Workflow Step Content ──────────────────────────────────────────────

export async function runWorkflowStepContent(
  ctx: WorkflowCommandContext,
  workflowName: string,
  stepName: string
): Promise<void> {
  const content = ctx.workflowEngine.getStepContent(workflowName, stepName);
  if (!content) {
    console.log(
      chalk.yellow(`No content found for step "${stepName}" in workflow "${workflowName}"`)
    );
    return;
  }

  const agentMode = ctx.workflowEngine.getStepAgentMode(workflowName, stepName);
  const hints = ctx.workflowEngine.getStepArgumentHints(workflowName, stepName);
  const workflow = ctx.workflowEngine.getWorkflow(workflowName);
  const step = workflow.steps.find((s) => s.name === stepName || s.customCommand === stepName);
  const nextSteps = step?.nextSteps ?? [];

  console.log(chalk.bold.cyan(`Command: /${stepName}`));
  if (agentMode) {
    console.log(chalk.dim(`  Mode: ${agentMode}`));
  }
  if (hints.length > 0) {
    console.log(chalk.dim(`  Arguments: ${hints.map((h) => h.name).join(', ')}`));
  }
  if (nextSteps.length > 0) {
    console.log(chalk.dim(`  Next Steps: ${nextSteps.map((s) => `/${s}`).join(', ')}`));
  }
  console.log('');
  console.log(content);
}

// ─── Workflow Create ────────────────────────────────────────────────────

export async function runWorkflowCreate(
  ctx: WorkflowCommandContext,
  name: string,
  options: { description?: string; steps?: string }
): Promise<void> {
  if (!options.steps) {
    console.error(chalk.red('--steps is required. Provide comma-separated step names.'));
    console.log(chalk.dim('Example: --steps "Plan,Execute,Verify,Complete"'));
    return;
  }

  const stepNames = options.steps
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (stepNames.length === 0) {
    console.error(chalk.red('At least one step is required.'));
    return;
  }

  const commandMap: Record<string, string> = {
    plan: 'plan',
    execute: 'exec',
    exec: 'exec',
    verify: 'verify',
    complete: 'complete',
  };

  const { createWorkflowStepDefId } = await import('../models/workflow.js');

  const steps = stepNames.map((stepName, index) => ({
    id: createWorkflowStepDefId(index + 1),
    name: stepName,
    description: '',
    order: index + 1,
    command:
      (commandMap[stepName.toLowerCase()] as 'plan' | 'exec' | 'verify' | 'complete' | 'custom') ??
      'custom',
    required: true,
  }));

  const definition = {
    name,
    description: options.description,
    steps,
  };

  try {
    await ctx.workflowEngine.createWorkflow(definition);
    console.log(chalk.green(`Workflow "${name}" created with ${steps.length} steps.`));
    console.log('');
    console.log(formatWorkflowDefinition(definition, ctx));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// ─── Workflow State ──────────────────────────────────────────────────────

export async function runWorkflowState(
  ctx: WorkflowCommandContext,
  workflowId: string
): Promise<void> {
  try {
    const state = ctx.workflowEngine.getWorkflowState(workflowId);
    console.log(formatWorkflowState(state));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// ─── Workflow Advance ────────────────────────────────────────────────────

export async function runWorkflowAdvance(
  ctx: WorkflowCommandContext,
  workflowId: string
): Promise<void> {
  try {
    const state = await ctx.workflowEngine.advanceWorkflow(workflowId);
    console.log(chalk.green('Workflow advanced!'));
    console.log('');
    console.log(formatWorkflowState(state));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// ─── Workflow Pause/Resume ──────────────────────────────────────────────

export async function runWorkflowPause(
  ctx: WorkflowCommandContext,
  workflowId: string
): Promise<void> {
  try {
    const state = await ctx.workflowEngine.pauseWorkflow(workflowId);
    console.log(chalk.yellow('Workflow paused.'));
    console.log('');
    console.log(formatWorkflowState(state));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

export async function runWorkflowResume(
  ctx: WorkflowCommandContext,
  workflowId: string
): Promise<void> {
  try {
    const state = await ctx.workflowEngine.resumeWorkflow(workflowId);
    console.log(chalk.green('Workflow resumed.'));
    console.log('');
    console.log(formatWorkflowState(state));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// ─── Git Status ─────────────────────────────────────────────────────────

export async function runGitStatus(ctx: WorkflowCommandContext): Promise<void> {
  if (!ctx.gitService) {
    console.error(chalk.red('Git service is not available.'));
    return;
  }

  try {
    const isRepo = await ctx.gitService.isRepository();
    if (!isRepo) {
      console.error(chalk.red('Not a git repository.'));
      return;
    }

    const status = await ctx.gitService.getStatus();
    const branch = await ctx.gitService.getCurrentBranch();

    console.log(chalk.bold('Git Status'));
    console.log(chalk.dim(`Branch: ${branch}`));
    if (status.ahead > 0 || status.behind > 0) {
      console.log(chalk.dim(`  ${status.ahead} ahead, ${status.behind} behind`));
    }
    console.log('');

    if (status.staged.length > 0) {
      console.log(chalk.green(`Staged (${status.staged.length}):`));
      for (const file of status.staged) {
        console.log(chalk.dim(`  + ${file}`));
      }
      console.log('');
    }

    if (status.unstaged.length > 0) {
      console.log(chalk.yellow(`Unstaged (${status.unstaged.length}):`));
      for (const file of status.unstaged) {
        console.log(chalk.dim(`  ~ ${file}`));
      }
      console.log('');
    }

    if (status.untracked.length > 0) {
      console.log(chalk.gray(`Untracked (${status.untracked.length}):`));
      for (const file of status.untracked) {
        console.log(chalk.dim(`  ? ${file}`));
      }
      console.log('');
    }

    if (
      status.staged.length === 0 &&
      status.unstaged.length === 0 &&
      status.untracked.length === 0
    ) {
      console.log(chalk.green('Working tree clean.'));
    }
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// ─── Git Diff ───────────────────────────────────────────────────────────

export async function runGitDiff(ctx: WorkflowCommandContext, ref?: string): Promise<void> {
  if (!ctx.gitService) {
    console.error(chalk.red('Git service is not available.'));
    return;
  }

  try {
    const isRepo = await ctx.gitService.isRepository();
    if (!isRepo) {
      console.error(chalk.red('Not a git repository.'));
      return;
    }

    const diffResult = ref ? await ctx.gitService.getDiff(ref) : await ctx.gitService.getDiff();

    console.log(chalk.bold(`Diff: ${chalk.cyan(diffResult.from)} → ${diffResult.to}`));
    console.log('');

    if (diffResult.files.length === 0) {
      console.log(chalk.dim('No changes.'));
      return;
    }

    for (const file of diffResult.files) {
      const typeIcon =
        file.type === 'added'
          ? '+'
          : file.type === 'deleted'
            ? '-'
            : file.type === 'renamed'
              ? '→'
              : '~';
      const typeColor =
        file.type === 'added'
          ? chalk.green
          : file.type === 'deleted'
            ? chalk.red
            : file.type === 'renamed'
              ? chalk.blue
              : chalk.yellow;

      console.log(`  ${typeColor(typeIcon)} ${file.file}`);
      if (file.oldFile) {
        console.log(chalk.dim(`    from: ${file.oldFile}`));
      }
      console.log(
        chalk.dim(
          `    ${chalk.green(`+${file.additions}`)} ${chalk.red(`-${file.deletions}`)} ${file.changes} changes`
        )
      );
    }

    console.log('');
    console.log(
      chalk.dim(
        `Total: ${diffResult.totalAdditions} additions, ${diffResult.totalDeletions} deletions, ${diffResult.files.length} files`
      )
    );
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// ─── Git Commit ─────────────────────────────────────────────────────────

export async function runGitCommit(
  ctx: WorkflowCommandContext,
  message: string,
  files?: string[]
): Promise<void> {
  if (!ctx.gitService) {
    console.error(chalk.red('Git service is not available.'));
    return;
  }

  try {
    const isRepo = await ctx.gitService.isRepository();
    if (!isRepo) {
      console.error(chalk.red('Not a git repository.'));
      return;
    }

    const result = await ctx.gitService.commit(message, files);
    console.log(chalk.green(`Committed: ${result.hash}`));
    console.log(chalk.dim(`  Message: ${result.message}`));
    if (result.files.length > 0) {
      console.log(chalk.dim(`  Files: ${result.files.length}`));
    }
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// ─── Formatters ─────────────────────────────────────────────────────────

function formatWorkflowDefinition(
  workflow: WorkflowDefinition,
  ctx: WorkflowCommandContext
): string {
  const lines: string[] = [];
  const isBuiltIn = ctx.workflowEngine.isBuiltIn(workflow.name);

  lines.push(chalk.bold.cyan(`Workflow: ${workflow.name}`));
  if (isBuiltIn) {
    lines.push(chalk.green('  [built-in]'));
  }
  if (workflow.description) {
    lines.push(chalk.dim(`  ${workflow.description}`));
  }
  lines.push('');
  lines.push('Steps:');
  for (const step of workflow.steps) {
    const required = step.required ? '' : chalk.dim(' (optional)');
    lines.push(`  ${chalk.yellow(`${step.order}.`)} ${chalk.bold(step.name)}${required}`);
    lines.push(
      chalk.dim(`     Command: ${step.command === 'custom' ? step.customCommand : step.command}`)
    );
    if (step.agentMode) {
      lines.push(chalk.dim(`     Agent Mode: ${step.agentMode}`));
    }
    if (step.nextSteps && step.nextSteps.length > 0) {
      lines.push(chalk.dim(`     Next Steps: ${step.nextSteps.map((s) => `/${s}`).join(', ')}`));
    }
    if (step.argumentHints && step.argumentHints.length > 0) {
      lines.push(
        chalk.dim(
          `     Arguments: ${step.argumentHints.map((h) => `${h.name}: ${h.description}`).join('; ')}`
        )
      );
    }
    if (step.description) {
      lines.push(chalk.dim(`     ${step.description}`));
    }
  }

  return lines.join('\n');
}

function formatWorkflowState(state: WorkflowState): string {
  const lines: string[] = [];

  const statusColor =
    state.status === 'completed'
      ? chalk.green
      : state.status === 'paused'
        ? chalk.yellow
        : chalk.cyan;

  lines.push(
    chalk.bold(`Workflow: ${chalk.cyan(state.definition.name)} [${statusColor(state.status)}]`)
  );
  lines.push(chalk.dim(`  ID: ${state.workflowId}`));
  lines.push(chalk.dim(`  Task: ${state.taskId}`));
  lines.push(chalk.dim(`  Started: ${state.startedAt}`));
  if (state.completedAt) {
    lines.push(chalk.dim(`  Completed: ${state.completedAt}`));
  }
  lines.push('');

  for (let i = 0; i < state.definition.steps.length; i++) {
    const step = state.definition.steps[i];
    const stepState = state.stepStates[i];
    const isCurrent = i === state.currentStepIndex && state.status === 'in_progress';

    const stepStatusColor =
      stepState.status === 'completed'
        ? chalk.green
        : stepState.status === 'active'
          ? chalk.yellow
          : stepState.status === 'skipped'
            ? chalk.gray
            : chalk.dim;

    const icon =
      stepState.status === 'completed'
        ? 'v'
        : stepState.status === 'active'
          ? '>'
          : stepState.status === 'skipped'
            ? '-'
            : 'o';

    const prefix = isCurrent ? chalk.bold('>') : ' ';
    lines.push(
      `${prefix} ${stepStatusColor(icon)} ${chalk.bold(step.name)} ${stepStatusColor(`[${stepState.status}]`)}`
    );
  }

  return lines.join('\n');
}
