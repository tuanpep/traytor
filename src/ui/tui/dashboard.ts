import chalk from 'chalk';
import type { Task, TaskStatus, TaskType } from '../../models/task.js';
import type { Phase } from '../../models/phase.js';
import type { Verification } from '../../models/verification.js';

export interface DashboardData {
  tasks: Task[];
  recentTasks: Task[];
  activePhases: Phase[];
  pendingVerifications: Verification[];
  taskStats: TaskStats;
}

export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byType: Record<TaskType, number>;
  completedToday: number;
}

function computeStats(tasks: Task[]): TaskStats {
  const stats: TaskStats = {
    total: tasks.length,
    byStatus: { pending: 0, in_progress: 0, completed: 0, failed: 0 },
    byType: { plan: 0, phases: 0, review: 0, epic: 0 },
    completedToday: 0,
  };

  const today = new Date().toISOString().split('T')[0];

  for (const task of tasks) {
    stats.byStatus[task.status]++;
    stats.byType[task.type]++;

    if (task.status === 'completed' && task.updatedAt.startsWith(today)) {
      stats.completedToday++;
    }
  }

  return stats;
}

export function buildDashboard(tasks: Task[]): DashboardData {
  const stats = computeStats(tasks);
  const recentTasks = tasks.slice(0, 5);

  const activePhases: Phase[] = [];
  const pendingVerifications: Verification[] = [];

  for (const task of tasks) {
    if (task.phases) {
      for (const phase of task.phases) {
        if (phase.status === 'in_progress') {
          activePhases.push(phase);
        }
        if (phase.status === 'pending' && phase.verification === undefined && phase.plan !== undefined) {
          pendingVerifications.push({
            id: `pending-${task.id}-${phase.order}`,
            taskId: task.id,
            timestamp: phase.updatedAt,
            comments: [],
            summary: 'Pending verification',
          });
        }
      }
    }
  }

  return { tasks, recentTasks, activePhases, pendingVerifications, taskStats: stats };
}

export function renderDashboard(data: DashboardData): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.bold.cyan('  SDD Tool Dashboard'));
  lines.push(chalk.dim('  ' + '─'.repeat(40)));
  lines.push('');

  // Task Statistics
  lines.push(chalk.bold('  Task Statistics'));
  lines.push('');

  const { byStatus, byType, total, completedToday } = data.taskStats;

  lines.push(`  ${chalk.white('Total:')} ${total}    ${chalk.green('Completed today:')} ${completedToday}`);
  lines.push('');

  lines.push('  Status:');
  lines.push(`    ${chalk.green('completed')}  ${chalk.dim(String(byStatus.completed).padStart(4))}  ${renderBar(byStatus.completed, total, chalk.green)}`);
  lines.push(`    ${chalk.yellow('in_progress')} ${chalk.dim(String(byStatus.in_progress).padStart(4))}  ${renderBar(byStatus.in_progress, total, chalk.yellow)}`);
  lines.push(`    ${chalk.gray('pending')}    ${chalk.dim(String(byStatus.pending).padStart(4))}  ${renderBar(byStatus.pending, total, chalk.gray)}`);
  lines.push(`    ${chalk.red('failed')}     ${chalk.dim(String(byStatus.failed).padStart(4))}  ${renderBar(byStatus.failed, total, chalk.red)}`);
  lines.push('');

  lines.push('  Types:');
  lines.push(`    ${chalk.blue('plan')}    ${chalk.dim(String(byType.plan).padStart(4))}  ${chalk.cyan('phases')}  ${chalk.dim(String(byType.phases).padStart(4))}  ${chalk.magenta('review')}  ${chalk.dim(String(byType.review).padStart(4))}  ${chalk.yellow('epic')}  ${chalk.dim(String(byType.epic).padStart(4))}`);
  lines.push('');

  // Active Phases
  if (data.activePhases.length > 0) {
    lines.push(chalk.bold('  Active Phases'));
    lines.push('');
    for (const phase of data.activePhases.slice(0, 5)) {
      lines.push(`    ${chalk.yellow('>')} ${phase.name} ${chalk.dim(`(${phase.id})`)}`);
    }
    lines.push('');
  }

  // Pending Verifications
  if (data.pendingVerifications.length > 0) {
    lines.push(chalk.bold('  Pending Verifications'));
    lines.push('');
    for (const v of data.pendingVerifications.slice(0, 5)) {
      lines.push(`    ${chalk.magenta('!')} ${chalk.dim(v.taskId)} - ${chalk.dim(v.summary)}`);
    }
    lines.push('');
  }

  // Recent Tasks
  if (data.recentTasks.length > 0) {
    lines.push(chalk.bold('  Recent Tasks'));
    lines.push('');
    for (const task of data.recentTasks) {
      const statusColor = task.status === 'completed'
        ? chalk.green
        : task.status === 'in_progress'
          ? chalk.yellow
          : task.status === 'failed'
            ? chalk.red
            : chalk.gray;

      const typeIcon = task.type === 'plan' ? 'P' : task.type === 'phases' ? 'H' : task.type === 'review' ? 'R' : 'E';

      lines.push(
        `    ${statusColor(`[${task.status.padEnd(11)}]`)} ${chalk.dim(typeIcon)} ${task.query.slice(0, 50)}${task.query.length > 50 ? '...' : ''}`
      );
    }
    lines.push('');
  }

  // Navigation hint
  lines.push(chalk.dim('  ─'.repeat(20)));
  lines.push(chalk.dim('  [d] Dashboard  [t] Tasks  [q] Quit'));

  return lines.join('\n');
}

function renderBar(count: number, total: number, color: (s: string) => string): string {
  if (total === 0) return '';
  const width = 20;
  const filled = Math.round((count / total) * width);
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}
