import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Plan } from '../../models/plan.js';

export interface PlanViewerState {
  currentStep: number;
  showCode: boolean;
}

export function renderPlanViewer(plan: Plan, state: PlanViewerState): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan(`  Plan: ${plan.id}`));
  lines.push(chalk.dim('  ' + '─'.repeat(40)));
  lines.push('');

  // Rationale
  if (plan.rationale) {
    lines.push(chalk.bold('  Rationale:'));
    const rationaleLines = plan.rationale.split('\n').slice(0, 4);
    for (const line of rationaleLines) {
      lines.push(chalk.dim(`    ${line}`));
    }
    if (plan.rationale.split('\n').length > 4) {
      lines.push(chalk.dim('    ...'));
    }
    lines.push('');
  }

  // Steps navigation
  lines.push(chalk.bold(`  Steps (${state.currentStep + 1}/${plan.steps.length}):`));
  lines.push('');

  // Step indicators
  const indicators = plan.steps.map((_, i) => {
    if (i === state.currentStep) return chalk.cyan.bold(`[${i + 1}]`);
    return chalk.dim(` ${i + 1} `);
  });
  lines.push('  ' + indicators.join(' '));
  lines.push('');

  // Current step detail
  const step = plan.steps[state.currentStep];
  if (step) {
    lines.push(chalk.bold.cyan(`  Step ${state.currentStep + 1}: ${step.title}`));
    lines.push('');

    if (step.description) {
      lines.push('  ' + step.description.split('\n').map((l) => l).join('\n  '));
      lines.push('');
    }

    // Files with highlighting
    if (step.files.length > 0) {
      lines.push(chalk.blue('  Files:'));
      for (const file of step.files) {
        lines.push(chalk.cyan(`    ${file}`));
      }
      lines.push('');
    }

    // Symbols
    if (step.symbols && step.symbols.length > 0) {
      lines.push(chalk.magenta('  Symbols:'));
      for (const symbol of step.symbols) {
        lines.push(chalk.magenta(`    ${symbol}`));
      }
      lines.push('');
    }

    // Code snippet
    if (step.codeSnippet && state.showCode) {
      lines.push(chalk.bold('  Code Snippet:'));
      lines.push('');
      const snippetLines = step.codeSnippet.split('\n');
      for (const line of snippetLines.slice(0, 20)) {
        lines.push(chalk.dim(`    ${line}`));
      }
      if (snippetLines.length > 20) {
        lines.push(chalk.dim('    ... (truncated)'));
      }
      lines.push('');
    } else if (step.codeSnippet && !state.showCode) {
      lines.push(chalk.dim('  [c] Show code snippet'));
      lines.push('');
    }
  }

  // Mermaid diagram
  if (plan.mermaidDiagram) {
    lines.push(chalk.dim('  Diagram available (not rendered in terminal)'));
    lines.push('');
  }

  // Navigation
  lines.push(chalk.dim('  ─'.repeat(20)));
  lines.push(chalk.dim('  [Left/Right] Navigate  [c] Toggle code  [b] Back  [q] Quit'));

  return lines.join('\n');
}

export async function promptPlanStepNavigation(plan: Plan, currentStep: number): Promise<{
  action: 'next' | 'prev' | 'toggle-code' | 'goto' | 'back';
  step?: number;
}> {
  const choices = [];

  if (currentStep > 0) {
    choices.push({ name: chalk.dim('< Previous Step'), value: 'prev' });
  }
  if (currentStep < plan.steps.length - 1) {
    choices.push({ name: chalk.dim('> Next Step'), value: 'next' });
  }

  choices.push({ name: 'Go to step...', value: 'goto' });
  choices.push({ name: 'Toggle code view', value: 'toggle-code' });
  choices.push({ name: chalk.gray('Back'), value: 'back' });

  const { action } = await inquirer.prompt([{
    type: 'select',
    name: 'action',
    message: `Step ${currentStep + 1}/${plan.steps.length}:`,
    choices,
  }]);

  if (action === 'goto') {
    const { stepNum } = await inquirer.prompt([{
      type: 'number',
      name: 'stepNum',
      message: 'Go to step number:',
      default: currentStep + 1,
      validate: (val: number) => val >= 1 && val <= plan.steps.length
        ? true
        : `Please enter a number between 1 and ${plan.steps.length}`,
    }]);
    return { action: 'goto', step: stepNum - 1 };
  }

  return { action };
}
