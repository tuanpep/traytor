import chalk from 'chalk';
import { GitHubService } from '../integrations/github/github-service.js';
import { TicketAssistService } from '../integrations/github/ticket-assist-service.js';
import type { PlanGenerator } from '../services/plan-generator.js';
import type { TaskRepository } from '../data/repositories/task.repository.js';

export interface TicketAssistContext {
  planGenerator: PlanGenerator;
  taskRepository: TaskRepository;
}

export async function runTicketAssistList(
  ctx: TicketAssistContext,
  owner: string,
  repo: string,
  options?: { label?: string }
): Promise<void> {
  const githubService = new GitHubService();

  if (!githubService.isConfigured()) {
    console.log(
      chalk.yellow('GitHub token not configured. Set GITHUB_TOKEN environment variable.')
    );
    return;
  }

  console.log(chalk.bold(`Fetching open issues from ${owner}/${repo}...`));
  console.log('');

  const issues = await githubService.listIssues(owner, repo, {
    state: 'open',
    labels: options?.label,
  });

  if (issues.length === 0) {
    console.log(chalk.dim('No open issues found.'));
    return;
  }

  console.log(chalk.cyan(`Found ${issues.length} open issue(s):\n`));

  for (const issue of issues) {
    const labels = issue.labels.length > 0 ? chalk.dim(`[${issue.labels.join(', ')}]`) : '';
    const assignee = issue.assignee ? chalk.green(`@${issue.assignee}`) : chalk.gray('unassigned');

    console.log(`#${issue.number} ${chalk.bold(issue.title)} ${labels}`);
    console.log(chalk.dim(`  ${assignee} · opened ${formatDate(issue.createdAt)}`));
    console.log('');
  }
}

export async function runTicketAssistPlan(
  ctx: TicketAssistContext,
  owner: string,
  repo: string,
  issueNumber: number,
  options?: { postComment?: boolean; dryRun?: boolean }
): Promise<void> {
  const githubService = new GitHubService();
  const ticketAssist = new TicketAssistService(githubService);
  ticketAssist.configure(ctx.planGenerator, ctx.taskRepository);

  if (!ticketAssist.isConfigured()) {
    console.log(
      chalk.yellow('GitHub token not configured. Set GITHUB_TOKEN environment variable.')
    );
    return;
  }

  console.log(chalk.bold(`Creating plan from issue ${owner}/${repo}#${issueNumber}...\n`));

  try {
    const result = await ticketAssist.createPlanFromIssue(owner, repo, issueNumber, {
      postComment: options?.postComment,
      dryRun: options?.dryRun,
    });

    console.log(chalk.green('✓ Plan generated successfully!'));
    console.log('');
    console.log(chalk.bold('Summary:'));
    console.log(`  Task ID:     ${chalk.cyan(result.taskId)}`);
    console.log(`  Issue:       #${result.issueNumber}: ${result.issueTitle}`);
    console.log(
      `  Plan:        ${result.planGenerated ? chalk.green('generated') : chalk.yellow('not generated')}`
    );
    console.log(
      `  Comment:     ${result.commentPosted ? chalk.green('posted') : chalk.gray('not posted')}`
    );
    console.log('');
    console.log(chalk.dim(`Run 'sdd exec ${result.taskId}' to implement this plan.`));
  } catch (error) {
    console.error(
      chalk.red(`Failed to create plan: ${error instanceof Error ? error.message : String(error)}`)
    );
    throw error;
  }
}

export async function runTicketAssistShow(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  const githubService = new GitHubService();

  if (!githubService.isConfigured()) {
    console.log(
      chalk.yellow('GitHub token not configured. Set GITHUB_TOKEN environment variable.')
    );
    return;
  }

  try {
    const issue = await githubService.getIssue(owner, repo, issueNumber);

    console.log(chalk.bold(`#${issue.number}: ${issue.title}`));
    console.log(chalk.dim(`State: ${issue.state} · Created: ${formatDate(issue.createdAt)}`));
    console.log('');

    if (issue.labels.length > 0) {
      console.log(chalk.cyan('Labels:'), issue.labels.join(', '));
    }

    if (issue.assignee) {
      console.log(chalk.cyan('Assignee:'), issue.assignee);
    }

    console.log('');
    console.log(chalk.bold('Description:'));
    console.log(issue.body || chalk.dim('No description provided.'));
    console.log('');
    console.log(chalk.dim(`URL: ${issue.url}`));
  } catch (error) {
    console.error(
      chalk.red(`Failed to fetch issue: ${error instanceof Error ? error.message : String(error)}`)
    );
    throw error;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
