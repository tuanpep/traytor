import chalk from 'chalk';
import type { Plan } from '../../models/plan.js';
import type { Task } from '../../models/task.js';
import type { Verification, VerificationComment, VerificationCategory } from '../../models/verification.js';

export function formatTask(task: Task): string {
  const statusColor =
    task.status === 'completed'
      ? chalk.green
      : task.status === 'in_progress'
        ? chalk.yellow
        : task.status === 'failed'
          ? chalk.red
          : chalk.gray;
  return `${chalk.dim(task.id)} ${statusColor(`[${task.status}]`)} ${task.query}`;
}

export function formatPlan(plan: Plan): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`Plan: ${plan.id}`));
  lines.push('');

  if (plan.rationale) {
    lines.push(chalk.bold('Rationale:'));
    lines.push(chalk.dim(plan.rationale));
    lines.push('');
  }

  lines.push(chalk.bold(`Steps (${plan.steps.length}):`));
  lines.push('');

  for (const [index, step] of plan.steps.entries()) {
    lines.push(chalk.yellow(`  ${index + 1}. ${step.title}`));
    if (step.description) {
      const descLines = step.description.split('\n').slice(0, 5);
      for (const line of descLines) {
        lines.push(chalk.dim(`     ${line}`));
      }
      if (step.description.split('\n').length > 5) {
        lines.push(chalk.dim('     ...'));
      }
    }
    if (step.files.length > 0) {
      lines.push(chalk.blue(`     Files: ${step.files.map((f) => `\`${f}\``).join(', ')}`));
    }
    if (step.symbols && step.symbols.length > 0) {
      lines.push(chalk.magenta(`     Symbols: ${step.symbols.join(', ')}`));
    }
    lines.push('');
  }

  if (plan.mermaidDiagram) {
    lines.push(chalk.dim('Diagram:'));
    lines.push(chalk.dim(plan.mermaidDiagram));
  }

  return lines.join('\n');
}

export function formatPlanMarkdown(plan: Plan): string {
  const lines: string[] = [];

  lines.push(`# Plan: ${plan.id}`);
  lines.push('');
  lines.push('## Rationale');
  lines.push('');
  lines.push(plan.rationale || 'No rationale provided.');
  lines.push('');
  lines.push('## Steps');
  lines.push('');

  for (const [index, step] of plan.steps.entries()) {
    lines.push(`### Step ${index + 1}: ${step.title}`);
    lines.push('');
    lines.push(step.description);
    lines.push('');
    if (step.files.length > 0) {
      lines.push(`**Files:** ${step.files.map((f) => `\`${f}\``).join(', ')}`);
      lines.push('');
    }
    if (step.symbols && step.symbols.length > 0) {
      lines.push(`**Symbols:** ${step.symbols.join(', ')}`);
      lines.push('');
    }
  }

  if (plan.mermaidDiagram) {
    lines.push('## Diagram');
    lines.push('');
    lines.push('```mermaid');
    lines.push(plan.mermaidDiagram);
    lines.push('```');
  }

  return lines.join('\n');
}

// ─── Verification Formatters ────────────────────────────────────────────────

const CATEGORY_COLORS: Record<VerificationCategory, typeof chalk.red> = {
  critical: chalk.red,
  major: chalk.yellow,
  minor: chalk.blue,
  outdated: chalk.gray,
};

const CATEGORY_ICONS: Record<VerificationCategory, string> = {
  critical: 'x',
  major: '!',
  minor: 'i',
  outdated: '-',
};

export function formatVerification(verification: Verification): string {
  if (verification.comments.length === 0) {
    return chalk.green('No issues found. Implementation matches the plan.');
  }

  const lines: string[] = [];

  // Group comments by category
  const grouped = new Map<VerificationCategory, VerificationComment[]>();
  for (const comment of verification.comments) {
    const existing = grouped.get(comment.category) || [];
    existing.push(comment);
    grouped.set(comment.category, existing);
  }

  // Display in severity order: critical, major, minor, outdated
  const order: VerificationCategory[] = ['critical', 'major', 'minor', 'outdated'];
  for (const category of order) {
    const comments = grouped.get(category);
    if (!comments || comments.length === 0) continue;

    const color = CATEGORY_COLORS[category];
    const icon = CATEGORY_ICONS[category];
    lines.push(color.bold(`${icon} ${category.toUpperCase()} (${comments.length})`));
    lines.push('');

    for (const comment of comments) {
      const location = comment.file
        ? comment.line
          ? `${chalk.cyan(comment.file)}:${chalk.dim(String(comment.line))}`
          : chalk.cyan(comment.file)
        : '';
      lines.push(`  ${color(icon)} ${comment.message}`);
      if (location) {
        lines.push(chalk.dim(`    Location: ${location}`));
      }
      if (comment.suggestion) {
        lines.push(chalk.dim(`    Suggestion: ${comment.suggestion}`));
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function formatVerificationSummary(verification: Verification): string {
  const counts: Record<VerificationCategory, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    outdated: 0,
  };

  for (const comment of verification.comments) {
    counts[comment.category]++;
  }

  const lines: string[] = [];
  lines.push(chalk.bold('Verification Summary'));
  lines.push(chalk.dim(`Task: ${verification.taskId}`));
  lines.push(chalk.dim(`Time: ${verification.timestamp}`));
  lines.push('');

  // Counts per category
  const parts: string[] = [];
  if (counts.critical > 0) parts.push(chalk.red(`${counts.critical} critical`));
  if (counts.major > 0) parts.push(chalk.yellow(`${counts.major} major`));
  if (counts.minor > 0) parts.push(chalk.blue(`${counts.minor} minor`));
  if (counts.outdated > 0) parts.push(chalk.gray(`${counts.outdated} outdated`));
  if (parts.length === 0) parts.push(chalk.green('0 issues'));

  lines.push(`Issues: ${parts.join(', ')}`);

  // Overall assessment
  if (counts.critical === 0 && counts.major === 0) {
    lines.push(chalk.green.bold('\nResult: APPROVED'));
  } else {
    lines.push(chalk.red.bold('\nResult: NEEDS_CHANGES'));
  }

  return lines.join('\n');
}
