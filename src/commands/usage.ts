import chalk from 'chalk';
import type { TaskService } from '../services/task.service.js';
import type { TaskUsage } from '../models/task.js';

const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-sonnet-4-20250514': { inputPer1M: 3, outputPer1M: 15 },
  'claude-opus-4-20250514': { inputPer1M: 15, outputPer1M: 75 },
  'claude-3-5-sonnet-latest': { inputPer1M: 3, outputPer1M: 15 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
};

function estimateCost(
  tokens: number,
  isOutput: boolean,
  model = 'claude-sonnet-4-20250514'
): number {
  const pricing = MODEL_PRICING[model] || { inputPer1M: 3, outputPer1M: 15 };
  const rate = isOutput ? pricing.outputPer1M : pricing.inputPer1M;
  return (tokens / 1_000_000) * rate;
}

function formatCost(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

export async function runUsageCommand(taskService: TaskService, taskId?: string): Promise<void> {
  if (taskId) {
    await showTaskUsage(taskService, taskId);
  } else {
    await showTotalUsage(taskService);
  }
}

async function showTaskUsage(taskService: TaskService, taskId: string): Promise<void> {
  const task = await taskService.getTask(taskId);
  const usage = task.usage;

  console.log(chalk.bold(`\nUsage for task: ${chalk.cyan(taskId)}\n`));
  console.log(chalk.dim('─'.repeat(50)));

  if (!usage) {
    console.log(chalk.dim('No usage data recorded for this task.\n'));
    return;
  }

  const totalInput = usage.planInputTokens + usage.verifyInputTokens + usage.reviewInputTokens;
  const totalOutput = usage.planOutputTokens + usage.verifyOutputTokens + usage.reviewOutputTokens;
  const totalTokens = totalInput + totalOutput;
  const estimatedCost =
    estimateCost(usage.planInputTokens, false) +
    estimateCost(usage.planOutputTokens, true) +
    estimateCost(usage.verifyInputTokens, false) +
    estimateCost(usage.verifyOutputTokens, true) +
    estimateCost(usage.reviewInputTokens, false) +
    estimateCost(usage.reviewOutputTokens, true);

  console.log(chalk.cyan('\nPlan Generation:'));
  console.log(`  Input:  ${usage.planInputTokens.toLocaleString()} tokens`);
  console.log(`  Output: ${usage.planOutputTokens.toLocaleString()} tokens`);

  console.log(chalk.cyan('\nVerification:'));
  console.log(`  Input:  ${usage.verifyInputTokens.toLocaleString()} tokens`);
  console.log(`  Output: ${usage.verifyOutputTokens.toLocaleString()} tokens`);

  console.log(chalk.cyan('\nReview:'));
  console.log(`  Input:  ${usage.reviewInputTokens.toLocaleString()} tokens`);
  console.log(`  Output: ${usage.reviewOutputTokens.toLocaleString()} tokens`);

  console.log(chalk.dim('\n' + '─'.repeat(50)));
  console.log(`Total Tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Estimated Cost: ${formatCost(estimatedCost)}`);
  console.log('');
}

async function showTotalUsage(taskService: TaskService): Promise<void> {
  const tasks = await taskService.listTasks();

  const totals: TaskUsage = {
    planInputTokens: 0,
    planOutputTokens: 0,
    verifyInputTokens: 0,
    verifyOutputTokens: 0,
    reviewInputTokens: 0,
    reviewOutputTokens: 0,
  };

  let tasksWithUsage = 0;

  for (const task of tasks) {
    if (task.usage) {
      tasksWithUsage++;
      totals.planInputTokens += task.usage.planInputTokens;
      totals.planOutputTokens += task.usage.planOutputTokens;
      totals.verifyInputTokens += task.usage.verifyInputTokens;
      totals.verifyOutputTokens += task.usage.verifyOutputTokens;
      totals.reviewInputTokens += task.usage.reviewInputTokens;
      totals.reviewOutputTokens += task.usage.reviewOutputTokens;
    }
  }

  const totalInput = totals.planInputTokens + totals.verifyInputTokens + totals.reviewInputTokens;
  const totalOutput =
    totals.planOutputTokens + totals.verifyOutputTokens + totals.reviewOutputTokens;
  const totalTokens = totalInput + totalOutput;
  const estimatedCost = estimateCost(totalInput, false) + estimateCost(totalOutput, true);

  console.log(chalk.bold('\nTotal Token Usage\n'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`Tasks with usage data: ${tasksWithUsage}/${tasks.length}`);

  console.log(chalk.cyan('\nPlan Generation:'));
  console.log(`  Input:  ${totals.planInputTokens.toLocaleString()} tokens`);
  console.log(`  Output: ${totals.planOutputTokens.toLocaleString()} tokens`);

  console.log(chalk.cyan('\nVerification:'));
  console.log(`  Input:  ${totals.verifyInputTokens.toLocaleString()} tokens`);
  console.log(`  Output: ${totals.verifyOutputTokens.toLocaleString()} tokens`);

  console.log(chalk.cyan('\nReview:'));
  console.log(`  Input:  ${totals.reviewInputTokens.toLocaleString()} tokens`);
  console.log(`  Output: ${totals.reviewOutputTokens.toLocaleString()} tokens`);

  console.log(chalk.dim('\n' + '─'.repeat(50)));
  console.log(`Total Tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Estimated Cost: ${formatCost(estimatedCost)}`);
  console.log('');
  console.log(chalk.dim('Note: Costs are estimates based on common model pricing.'));
  console.log(chalk.dim('      Actual costs may vary by model and provider.\n'));
}
