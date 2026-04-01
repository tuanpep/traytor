import { getLogger } from '../../utils/logger.js';
import { GitHubService, type GitHubIssue, type GitHubRepoConfig } from './github-service.js';
import type { PlanGenerator } from '../../services/plan-generator.js';
import type { TaskRepository } from '../../data/repositories/task.repository.js';
import type { Task } from '../../models/task.js';

export interface TicketAssistConfig {
  repos: GitHubRepoConfig[];
}

export interface PlanFromIssueResult {
  taskId: string;
  issueNumber: number;
  issueTitle: string;
  planGenerated: boolean;
  commentPosted: boolean;
}

export class TicketAssistService {
  private logger = getLogger();
  private githubService: GitHubService;
  private planGenerator?: PlanGenerator;
  private taskRepository?: TaskRepository;

  constructor(githubService?: GitHubService) {
    this.githubService = githubService ?? new GitHubService();
  }

  configure(planGenerator: PlanGenerator, taskRepository: TaskRepository): void {
    this.planGenerator = planGenerator;
    this.taskRepository = taskRepository;
  }

  isConfigured(): boolean {
    return this.githubService.isConfigured();
  }

  async createPlanFromIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    options?: { postComment?: boolean; dryRun?: boolean }
  ): Promise<PlanFromIssueResult> {
    if (!this.planGenerator || !this.taskRepository) {
      throw new Error('TicketAssistService not configured. Call configure() first.');
    }

    this.logger.info(`Creating plan from issue ${owner}/${repo}#${issueNumber}`);

    const issue = await this.githubService.getIssue(owner, repo, issueNumber);

    this.logger.info(`Fetched issue: "${issue.title}"`);

    const contextCarryOver: string[] = [];
    const relatedIssues: GitHubIssue[] = [];

    if (issue.body) {
      const mentionedIssues = issue.body.match(/#(\d+)/g);
      if (mentionedIssues) {
        for (const mention of mentionedIssues) {
          const mentionedNumber = parseInt(mention.slice(1), 10);
          if (mentionedNumber !== issueNumber) {
            try {
              const relatedIssue = await this.githubService.getIssue(owner, repo, mentionedNumber);
              relatedIssues.push(relatedIssue);
              contextCarryOver.push(
                `Issue #${relatedIssue.number}: ${relatedIssue.title}\n${relatedIssue.body}`
              );
            } catch {
              this.logger.warn(`Could not fetch related issue #${mentionedNumber}`);
            }
          }
        }
      }
    }

    const query = this.buildQueryFromIssue(issue, relatedIssues);

    this.logger.info('Generating plan from issue...');
    const plan = await this.planGenerator.generate(query, contextCarryOver);

    const taskId = `gh_${owner}_${repo}_${issueNumber}`;
    const now = new Date().toISOString();
    const task: Task = {
      id: taskId,
      type: 'plan',
      query,
      status: 'completed',
      context: {
        files: [],
        folders: [],
        source: 'github',
        repo: `${owner}/${repo}`,
        issueNumber,
        issueUrl: issue.url,
      },
      plan,
      executions: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.taskRepository.save(task);

    this.logger.info(`Created task: ${taskId}`);

    let commentPosted = false;
    if (options?.postComment && !options?.dryRun) {
      const commentBody = this.formatPlanAsComment(issue, plan);
      try {
        await this.githubService.createIssueComment(owner, repo, issueNumber, commentBody);
        commentPosted = true;
        this.logger.info('Posted plan comment to GitHub');
      } catch (error) {
        this.logger.warn(`Failed to post comment: ${error}`);
      }
    }

    return {
      taskId: task.id,
      issueNumber: issue.number,
      issueTitle: issue.title,
      planGenerated: true,
      commentPosted,
    };
  }

  async listTrackedIssues(owner: string, repo: string, label?: string): Promise<GitHubIssue[]> {
    return this.githubService.listIssues(owner, repo, {
      state: 'open',
      labels: label,
    });
  }

  private buildQueryFromIssue(issue: GitHubIssue, relatedIssues: GitHubIssue[]): string {
    let query = `# GitHub Issue #${issue.number}: ${issue.title}\n\n`;
    query += `${issue.body || 'No description provided.'}\n\n`;

    if (issue.labels.length > 0) {
      query += `## Labels\n${issue.labels.map((l) => `- ${l}`).join('\n')}\n\n`;
    }

    if (issue.assignee) {
      query += `## Assignee\n${issue.assignee}\n\n`;
    }

    if (relatedIssues.length > 0) {
      query += `## Related Issues\n`;
      for (const related of relatedIssues) {
        query += `- #${related.number}: ${related.title}\n`;
      }
      query += '\n';
    }

    return query;
  }

  private formatPlanAsComment(
    issue: GitHubIssue,
    plan: {
      title?: string;
      steps?: { title: string; description: string; files?: string[] }[];
      mermaidDiagram?: string;
    }
  ): string {
    let comment = `## 📋 Implementation Plan for #${issue.number}\n\n`;
    comment += `*Generated by Traytor*\n\n`;

    if (plan.title) {
      comment += `### ${plan.title}\n\n`;
    }

    if (plan.steps && plan.steps.length > 0) {
      comment += `### Steps\n\n`;
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;
        comment += `${i + 1}. **${step.title}**\n`;
        if (step.description) {
          comment += `   ${step.description}\n`;
        }
        if (step.files && step.files.length > 0) {
          comment += `   📁 Files: ${step.files.map((f) => `\`${f}\``).join(', ')}\n`;
        }
        comment += '\n';
      }
    }

    if (plan.mermaidDiagram) {
      comment += `### Visual Overview\n\n`;
      comment += `\`\`\`mermaid\n${plan.mermaidDiagram}\n\`\`\`\n\n`;
    }

    comment += `---\n`;
    comment += `💡 *This plan was auto-generated by [Traytor](https://traycer.ai). Run with \`traytor exec ${issue.number}\` to implement.*`;

    return comment;
  }
}

export const ticketAssistService = new TicketAssistService();
