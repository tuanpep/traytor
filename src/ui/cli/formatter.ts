import chalk from 'chalk';
import type { Plan } from '../../models/plan.js';
import type { Task } from '../../models/task.js';
import type { Phase, PhaseStatus } from '../../models/phase.js';
import type { Verification, VerificationComment, VerificationCategory } from '../../models/verification.js';
import type { Review, ReviewComment, ReviewCategory, ReviewSeverity } from '../../models/review.js';
import type { Epic, Spec, Ticket, TicketStatus, SpecType } from '../../models/epic.js';

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

// ─── Phase Formatters ──────────────────────────────────────────────────────

const PHASE_STATUS_COLORS: Record<PhaseStatus, typeof chalk.green> = {
  pending: chalk.gray,
  in_progress: chalk.yellow,
  completed: chalk.green,
  blocked: chalk.red,
};

const PHASE_STATUS_ICONS: Record<PhaseStatus, string> = {
  pending: 'o',
  in_progress: '>',
  completed: 'v',
  blocked: 'x',
};

export function formatPhase(phase: Phase): string {
  const color = PHASE_STATUS_COLORS[phase.status];
  const icon = PHASE_STATUS_ICONS[phase.status];

  const lines: string[] = [];
  lines.push(`${color(icon)} ${chalk.bold(`Phase ${phase.order}: ${phase.name}`)} ${color(`[${phase.status}]`)}`);
  lines.push(chalk.dim(`  ID: ${phase.id}`));

  if (phase.description) {
    const descLines = phase.description.split('\n').slice(0, 4);
    for (const line of descLines) {
      lines.push(chalk.dim(`  ${line}`));
    }
    if (phase.description.split('\n').length > 4) {
      lines.push(chalk.dim('  ...'));
    }
  }

  if (phase.plan) {
    lines.push(chalk.blue(`  Plan: ${phase.plan.id} (${phase.plan.steps.length} steps)`));
  }

  if (phase.verification) {
    const critCount = phase.verification.comments.filter((c) => c.category === 'critical').length;
    const majCount = phase.verification.comments.filter((c) => c.category === 'major').length;
    if (critCount === 0 && majCount === 0) {
      lines.push(chalk.green('  Verification: APPROVED'));
    } else {
      lines.push(chalk.red(`  Verification: NEEDS_CHANGES (${critCount} critical, ${majCount} major)`));
    }
  }

  return lines.join('\n');
}

export function formatPhases(phases: Phase[]): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`Phases (${phases.length}):`));
  lines.push('');

  for (const phase of phases) {
    lines.push(formatPhase(phase));
    lines.push('');
  }

  // Summary
  const completed = phases.filter((p) => p.status === 'completed').length;
  const inProgress = phases.filter((p) => p.status === 'in_progress').length;
  const pending = phases.filter((p) => p.status === 'pending').length;
  const blocked = phases.filter((p) => p.status === 'blocked').length;

  lines.push(chalk.dim(`Progress: ${completed}/${phases.length} completed, ${inProgress} in progress, ${pending} pending, ${blocked} blocked`));

  return lines.join('\n');
}

// ─── Review Formatters ────────────────────────────────────────────────────

const REVIEW_CATEGORY_COLORS: Record<ReviewCategory, typeof chalk.red> = {
  bug: chalk.red,
  performance: chalk.yellow,
  security: chalk.magenta,
  clarity: chalk.blue,
};

const REVIEW_CATEGORY_ICONS: Record<ReviewCategory, string> = {
  bug: 'B',
  performance: 'P',
  security: 'S',
  clarity: 'C',
};

const REVIEW_SEVERITY_COLORS: Record<ReviewSeverity, typeof chalk.red> = {
  critical: chalk.red.bold,
  major: chalk.yellow,
  minor: chalk.gray,
};

export function formatReview(review: Review): string {
  const comments = review.comments ?? [];

  if (comments.length === 0) {
    return chalk.green('No issues found. Code review passed.');
  }

  const lines: string[] = [];

  // Group comments by category
  const grouped = new Map<ReviewCategory, ReviewComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.category) || [];
    existing.push(comment);
    grouped.set(comment.category, existing);
  }

  // Display in priority order: security, bug, performance, clarity
  const order: ReviewCategory[] = ['security', 'bug', 'performance', 'clarity'];
  for (const category of order) {
    const categoryComments = grouped.get(category);
    if (!categoryComments || categoryComments.length === 0) continue;

    const color = REVIEW_CATEGORY_COLORS[category];
    const icon = REVIEW_CATEGORY_ICONS[category];
    lines.push(color.bold(`${icon} ${category.toUpperCase()} (${categoryComments.length})`));
    lines.push('');

    for (const comment of categoryComments) {
      const severityColor = REVIEW_SEVERITY_COLORS[comment.severity];
      const location = comment.file
        ? comment.line
          ? `${chalk.cyan(comment.file)}:${chalk.dim(String(comment.line))}`
          : chalk.cyan(comment.file)
        : '';
      lines.push(`  ${color(icon)} [${severityColor(comment.severity.toUpperCase())}] ${comment.message}`);
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

export function formatReviewSummary(review: Review): string {
  const comments = review.comments ?? [];
  const summary = review.summary ?? {
    totalComments: comments.length,
    byCategory: {} as Record<ReviewCategory, number>,
    bySeverity: {} as Record<ReviewSeverity, number>,
    overallAssessment: '',
    keyFindings: [],
  };

  const lines: string[] = [];
  lines.push(chalk.bold('Code Review Summary'));
  lines.push(chalk.dim(`Query: ${review.query}`));
  lines.push(chalk.dim(`Scope: ${review.scope}`));
  lines.push(chalk.dim(`Files: ${(review.files ?? []).length}`));
  lines.push(chalk.dim(`Time: ${review.timestamp}`));
  lines.push('');

  // Category counts
  const { byCategory, bySeverity, overallAssessment, keyFindings } = summary;
  const catParts: string[] = [];
  for (const [cat, count] of Object.entries(byCategory ?? {})) {
    if (count > 0) {
      catParts.push(`${REVIEW_CATEGORY_COLORS[cat as ReviewCategory](`${count} ${cat}`)}`);
    }
  }
  if (catParts.length === 0) catParts.push(chalk.green('0 findings'));
  lines.push(`Findings: ${catParts.join(', ')}`);

  // Severity counts
  const sevParts: string[] = [];
  for (const [sev, count] of Object.entries(bySeverity ?? {})) {
    if (count > 0) {
      sevParts.push(`${REVIEW_SEVERITY_COLORS[sev as ReviewSeverity](`${count} ${sev}`)}`);
    }
  }
  if (sevParts.length > 0) {
    lines.push(`Severity: ${sevParts.join(', ')}`);
  }

  // Overall assessment
  const assessmentColor =
    overallAssessment === 'APPROVED' ? chalk.green.bold :
    overallAssessment === 'HAS_CONCERNS' ? chalk.yellow.bold :
    chalk.red.bold;
  lines.push(assessmentColor(`\nResult: ${overallAssessment}`));

  // Key findings
  if (keyFindings?.length > 0) {
    lines.push('');
    lines.push(chalk.bold('Key Findings:'));
    for (const finding of keyFindings) {
      lines.push(chalk.dim(`  - ${finding}`));
    }
  }

  return lines.join('\n');
}

// ─── Epic Formatters ──────────────────────────────────────────────────────

const SPEC_TYPE_COLORS: Record<SpecType, typeof chalk.green> = {
  prd: chalk.blue,
  tech: chalk.green,
  design: chalk.magenta,
  api: chalk.yellow,
};

const TICKET_STATUS_COLORS: Record<TicketStatus, typeof chalk.green> = {
  todo: chalk.gray,
  in_progress: chalk.yellow,
  done: chalk.green,
};

const TICKET_STATUS_ICONS: Record<TicketStatus, string> = {
  todo: 'o',
  in_progress: '>',
  done: 'v',
};

export function formatSpec(spec: Spec): string {
  const color = SPEC_TYPE_COLORS[spec.type];
  const lines: string[] = [];
  lines.push(`${color(`[${spec.type.toUpperCase()}]`)} ${chalk.bold(spec.title)}`);
  lines.push(chalk.dim(`  ID: ${spec.id}`));
  lines.push(chalk.dim(`  Created: ${spec.createdAt}`));
  lines.push(chalk.dim(`  Updated: ${spec.updatedAt}`));

  if (spec.content) {
    const preview = spec.content.split('\n').slice(0, 5).join('\n');
    lines.push('');
    lines.push(chalk.dim(preview));
    if (spec.content.split('\n').length > 5) {
      lines.push(chalk.dim('  ...'));
    }
  }

  return lines.join('\n');
}

export function formatSpecList(specs: Spec[]): string {
  const lines: string[] = [];
  lines.push(chalk.bold.cyan(`Specs (${specs.length}):`));
  lines.push('');

  for (const spec of specs) {
    const color = SPEC_TYPE_COLORS[spec.type];
    lines.push(`  ${color(`[${spec.type.toUpperCase()}]`)} ${spec.title}`);
    lines.push(chalk.dim(`    ID: ${spec.id}  |  Updated: ${spec.updatedAt}`));
    lines.push('');
  }

  return lines.join('\n');
}

export function formatTicket(ticket: Ticket): string {
  const color = TICKET_STATUS_COLORS[ticket.status];
  const icon = TICKET_STATUS_ICONS[ticket.status];

  const lines: string[] = [];
  lines.push(`${color(icon)} ${chalk.bold(ticket.title)} ${color(`[${ticket.status}]`)}`);
  lines.push(chalk.dim(`  ID: ${ticket.id}`));

  if (ticket.description) {
    const descLines = ticket.description.split('\n').slice(0, 3);
    for (const line of descLines) {
      lines.push(chalk.dim(`  ${line}`));
    }
    if (ticket.description.split('\n').length > 3) {
      lines.push(chalk.dim('  ...'));
    }
  }

  if (ticket.acceptanceCriteria.length > 0) {
    lines.push(chalk.blue('  Acceptance Criteria:'));
    for (const ac of ticket.acceptanceCriteria) {
      lines.push(chalk.dim(`    - ${ac}`));
    }
  }

  if (ticket.linkedSpecs.length > 0) {
    lines.push(chalk.magenta(`  Linked specs: ${ticket.linkedSpecs.join(', ')}`));
  }

  if (ticket.assignee) {
    lines.push(chalk.cyan(`  Assignee: ${ticket.assignee}`));
  }

  return lines.join('\n');
}

export function formatTicketList(tickets: Ticket[]): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`Tickets (${tickets.length}):`));
  lines.push('');

  for (const ticket of tickets) {
    const color = TICKET_STATUS_COLORS[ticket.status];
    const icon = TICKET_STATUS_ICONS[ticket.status];
    lines.push(`  ${color(icon)} ${ticket.title} ${color(`[${ticket.status}]`)}`);
    lines.push(chalk.dim(`    ID: ${ticket.id}`));
    lines.push('');
  }

  // Summary
  const todo = tickets.filter((t) => t.status === 'todo').length;
  const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
  const done = tickets.filter((t) => t.status === 'done').length;

  lines.push(chalk.dim(`Progress: ${done}/${tickets.length} done, ${inProgress} in progress, ${todo} todo`));

  return lines.join('\n');
}

export function formatEpic(epic: Epic): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`Epic: ${epic.id}`));
  lines.push('');

  // Workflow
  if (epic.workflow) {
    lines.push(chalk.bold('Workflow:'));
    lines.push(chalk.dim(`  ${epic.workflow.name} (${epic.workflow.steps.length} steps)`));
    for (const step of epic.workflow.steps) {
      lines.push(chalk.dim(`    ${step.order}. ${step.name}: ${step.description}`));
    }
    lines.push('');
  }

  // Specs summary
  if (epic.specs.length > 0) {
    lines.push(chalk.bold(`Specs (${epic.specs.length}):`));
    for (const spec of epic.specs) {
      const color = SPEC_TYPE_COLORS[spec.type];
      lines.push(`  ${color(`[${spec.type.toUpperCase()}]`)} ${spec.title}`);
    }
    lines.push('');
  }

  // Tickets summary
  if (epic.tickets.length > 0) {
    lines.push(chalk.bold(`Tickets (${epic.tickets.length}):`));
    for (const ticket of epic.tickets) {
      const color = TICKET_STATUS_COLORS[ticket.status];
      const icon = TICKET_STATUS_ICONS[ticket.status];
      lines.push(`  ${color(icon)} ${ticket.title} ${color(`[${ticket.status}]`)}`);
    }
    lines.push('');

    const todo = epic.tickets.filter((t) => t.status === 'todo').length;
    const inProgress = epic.tickets.filter((t) => t.status === 'in_progress').length;
    const done = epic.tickets.filter((t) => t.status === 'done').length;
    lines.push(chalk.dim(`Progress: ${done}/${epic.tickets.length} done, ${inProgress} in progress, ${todo} todo`));
  }

  return lines.join('\n');
}

export function formatReviewMarkdown(review: Review): string {
  const comments = review.comments ?? [];
  const summary = review.summary ?? {
    totalComments: comments.length,
    byCategory: {} as Record<ReviewCategory, number>,
    bySeverity: {} as Record<ReviewSeverity, number>,
    overallAssessment: '',
    keyFindings: [],
  };

  const lines: string[] = [];

  lines.push(`# Code Review: ${review.query}`);
  lines.push('');
  lines.push(`- **Scope:** ${review.scope}`);
  lines.push(`- **Files Reviewed:** ${(review.files ?? []).length}`);
  lines.push(`- **Time:** ${review.timestamp}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Findings:** ${summary.totalComments}`);
  for (const [cat, count] of Object.entries(summary.byCategory ?? {})) {
    if (count > 0) lines.push(`- **${cat.charAt(0).toUpperCase() + cat.slice(1)}:** ${count}`);
  }
  lines.push(`- **Result:** ${summary.overallAssessment}`);
  lines.push('');

  // Key findings
  if (summary.keyFindings?.length > 0) {
    lines.push('### Key Findings');
    lines.push('');
    for (const finding of summary.keyFindings) {
      lines.push(`- ${finding}`);
    }
    lines.push('');
  }

  // Detailed findings
  lines.push('## Detailed Findings');
  lines.push('');

  const grouped = new Map<ReviewCategory, ReviewComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.category) || [];
    existing.push(comment);
    grouped.set(comment.category, existing);
  }

  const order: ReviewCategory[] = ['security', 'bug', 'performance', 'clarity'];
  for (const category of order) {
    const categoryComments = grouped.get(category);
    if (!categoryComments || categoryComments.length === 0) continue;

    lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)} (${categoryComments.length})`);
    lines.push('');

    for (const comment of categoryComments) {
      lines.push(`- **[${comment.severity.toUpperCase()}]** ${comment.message}`);
      if (comment.file) {
        const loc = comment.line ? `${comment.file}:${comment.line}` : comment.file;
        lines.push(`  - File: \`${loc}\``);
      }
      if (comment.suggestion) {
        lines.push(`  - Suggestion: ${comment.suggestion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
