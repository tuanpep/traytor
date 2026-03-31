import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Verification, VerificationComment, VerificationCategory } from '../../models/verification.js';

const CATEGORY_COLORS: Record<VerificationCategory, typeof chalk.red> = {
  critical: chalk.red,
  major: chalk.yellow,
  minor: chalk.blue,
  outdated: chalk.gray,
};

const CATEGORY_ICONS: Record<VerificationCategory, string> = {
  critical: 'X',
  major: '!',
  minor: 'i',
  outdated: '-',
};

export function renderVerificationViewer(verification: Verification): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan(`  Verification: ${verification.id}`));
  lines.push(chalk.dim(`  Task: ${verification.taskId}`));
  lines.push(chalk.dim(`  Time: ${verification.timestamp}`));
  lines.push(chalk.dim('  ' + '─'.repeat(40)));
  lines.push('');

  if (verification.comments.length === 0) {
    lines.push(chalk.green.bold('  No issues found. Implementation matches the plan.'));
    lines.push('');
    return lines.join('\n');
  }

  // Summary counts
  const counts: Record<VerificationCategory, number> = { critical: 0, major: 0, minor: 0, outdated: 0 };
  for (const comment of verification.comments) {
    counts[comment.category]++;
  }

  lines.push(chalk.bold('  Summary:'));
  const parts: string[] = [];
  if (counts.critical > 0) parts.push(chalk.red(`${counts.critical} critical`));
  if (counts.major > 0) parts.push(chalk.yellow(`${counts.major} major`));
  if (counts.minor > 0) parts.push(chalk.blue(`${counts.minor} minor`));
  if (counts.outdated > 0) parts.push(chalk.gray(`${counts.outdated} outdated`));
  if (parts.length === 0) parts.push(chalk.green('0 issues'));
  lines.push(`  ${parts.join(chalk.dim(' | '))}`);
  lines.push('');

  // Overall result
  if (counts.critical === 0 && counts.major === 0) {
    lines.push(chalk.green.bold('  Result: APPROVED'));
  } else {
    lines.push(chalk.red.bold('  Result: NEEDS_CHANGES'));
  }
  lines.push('');

  // Grouped comments
  const order: VerificationCategory[] = ['critical', 'major', 'minor', 'outdated'];
  for (const category of order) {
    const comments = verification.comments.filter((c) => c.category === category);
    if (comments.length === 0) continue;

    const color = CATEGORY_COLORS[category];
    const icon = CATEGORY_ICONS[category];

    lines.push(color.bold(`  ${icon} ${category.toUpperCase()} (${comments.length})`));
    lines.push(chalk.dim('  ' + '─'.repeat(30)));

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      lines.push('');
      lines.push(`  ${color(icon)} ${color(`Issue ${i + 1}`)}`);

      if (comment.file) {
        const location = comment.line
          ? `${chalk.cyan(comment.file)}:${chalk.dim(String(comment.line))}`
          : chalk.cyan(comment.file);
        lines.push(chalk.dim(`    Location: ${location}`));
      }

      lines.push(`    ${comment.message}`);

      if (comment.suggestion) {
        lines.push('');
        lines.push(chalk.green(`    Suggestion: ${comment.suggestion}`));
        lines.push(chalk.dim('    [a] Apply this fix'));
      }

      if (comment.status === 'fixed') {
        lines.push(chalk.green.dim('    Status: RESOLVED'));
      }
    }

    lines.push('');
  }

  lines.push(chalk.dim('  ─'.repeat(20)));
  lines.push(chalk.dim('  [a] Apply suggestion  [b] Back  [q] Quit'));

  return lines.join('\n');
}

export async function promptVerificationAction(comments: VerificationComment[]): Promise<{
  action: 'apply' | 'back' | 'dismiss';
  commentId?: string;
}> {
  const actionableComments = comments.filter((c) => c.suggestion);

  if (actionableComments.length === 0) {
    const { action } = await inquirer.prompt([{
      type: 'select',
      name: 'action',
      message: 'Verification actions:',
      choices: [
        { name: 'Back', value: 'back' },
      ],
    }]);
    return { action };
  }

  const choices = actionableComments.map((comment) => ({
    name: `${comment.message.slice(0, 60)}${comment.message.length > 60 ? '...' : ''}`,
    value: comment.id,
  }));

  choices.push({ name: chalk.gray('Back'), value: 'back' });

  const { selected } = await inquirer.prompt([{
    type: 'select',
    name: 'selected',
    message: 'Select a suggestion to apply:',
    choices,
    pageSize: 15,
  }]);

  if (selected === 'back') {
    return { action: 'back' };
  }

  return { action: 'apply', commentId: selected };
}
