import { getLogger } from '../../utils/logger.js';
import { TraytorError, ErrorCode } from '../../utils/errors.js';

export class GitHubError extends TraytorError {
  constructor(message: string, suggestion?: string) {
    super(ErrorCode.GIT_ERROR, message, suggestion ?? '');
  }
}

export interface GitHubRepoConfig {
  owner: string;
  repo: string;
  defaultBranch?: string;
  planCreation?: boolean;
  trigger?: 'issue_created' | 'issue_assigned' | 'label_added';
  triggerLabel?: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  assignee?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  author: string;
  createdAt: string;
}

export interface GitHubPlanPayload {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  repoUrl: string;
  defaultBranch: string;
  files?: string[];
}

export class GitHubService {
  private logger = getLogger();
  private token?: string;

  constructor(token?: string) {
    this.token = token ?? process.env.GITHUB_TOKEN;
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new GitHubError(
        'GitHub token not configured. Set GITHUB_TOKEN environment variable.',
        'Configure your GitHub personal access token with repo scope'
      );
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new GitHubError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        `Check your token permissions and repository access. Details: ${error}`
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const issue = await this.request<{
      id: number;
      number: number;
      title: string;
      body: string | null;
      state: string;
      labels: { name: string }[];
      assignee: { login: string } | null;
      html_url: string;
      created_at: string;
      updated_at: string;
    }>(`/repos/${owner}/${repo}/issues/${issueNumber}`);

    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      state: issue.state,
      labels: issue.labels.map((l) => l.name),
      assignee: issue.assignee?.login,
      url: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    };
  }

  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: 'open' | 'closed' | 'all';
      labels?: string;
      assignee?: string;
    }
  ): Promise<GitHubIssue[]> {
    const params = new URLSearchParams();
    if (options?.state) params.set('state', options.state);
    if (options?.labels) params.set('labels', options.labels);
    if (options?.assignee) params.set('assignee', options.assignee);

    const issues = await this.request<
      {
        id: number;
        number: number;
        title: string;
        body: string | null;
        state: string;
        labels: { name: string }[];
        assignee: { login: string } | null;
        html_url: string;
        created_at: string;
        updated_at: string;
        pull_request?: { url: string };
      }[]
    >(`/repos/${owner}/${repo}/issues?${params}`);

    return issues
      .filter((i) => !i.pull_request)
      .map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body ?? '',
        state: issue.state,
        labels: issue.labels.map((l) => l.name),
        assignee: issue.assignee?.login,
        url: issue.html_url,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }));
  }

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<GitHubComment> {
    const comment = await this.request<{
      id: number;
      body: string;
      user: { login: string };
      created_at: string;
    }>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    return {
      id: comment.id,
      body: comment.body,
      author: comment.user.login,
      createdAt: comment.created_at,
    };
  }

  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      labels?: string[];
    }
  ): Promise<GitHubIssue> {
    const issue = await this.request<{
      id: number;
      number: number;
      title: string;
      body: string | null;
      state: string;
      labels: { name: string }[];
      assignee: { login: string } | null;
      html_url: string;
      created_at: string;
      updated_at: string;
    }>(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      state: issue.state,
      labels: issue.labels.map((l) => l.name),
      assignee: issue.assignee?.login,
      url: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    };
  }

  async addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ): Promise<string[]> {
    return this.request<string[]>(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels }),
    });
  }

  async removeLabel(
    owner: string,
    repo: string,
    issueNumber: number,
    label: string
  ): Promise<void> {
    await this.request(
      `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
      {
        method: 'DELETE',
      }
    );
  }

  async getRepo(
    owner: string,
    repo: string
  ): Promise<{
    id: number;
    fullName: string;
    defaultBranch: string;
    description: string | null;
    url: string;
  }> {
    return this.request(`/repos/${owner}/${repo}`);
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const params = ref ? `?ref=${ref}` : '';
    const file = await this.request<{ content: string; encoding: string }>(
      `/repos/${owner}/${repo}/contents/${path}${params}`
    );

    if (file.encoding === 'base64') {
      return Buffer.from(file.content, 'base64').toString('utf-8');
    }

    return file.content;
  }

  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const patterns = [/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/, /^([^/]+)\/([^/]+)$/];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1]!, repo: match[2]! };
      }
    }

    return null;
  }
}

export const githubService = new GitHubService();
