import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  EventEmitter,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  ThemeIcon,
  ThemeColor,
} from 'vscode';
import type { TraytorOutputChannel } from './output-channel.js';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export interface TraytorTask {
  id: string;
  query: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  phases?: PhaseInfo[];
  plan?: {
    id: string;
    steps: { title: string; description: string; files?: string[] }[];
  };
  verification?: {
    comments: {
      id: string;
      category: string;
      message: string;
      status: string;
      suggestion?: string;
    }[];
    summary: string;
  };
}

export interface PhaseInfo {
  order: number;
  name: string;
  description: string;
  status: string;
}

export type TreeElement = TraytorTask | PhaseInfo | GroupNode | StatusGroupNode;

export interface GroupNode {
  id: string;
  label: string;
  icon: string;
  type: 'group';
}

export interface StatusGroupNode {
  id: string;
  label: string;
  icon: string;
  type: 'status-group';
  status: string;
}

export class TraytorTaskProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private tasks: TraytorTask[] = [];
  private outputChannel: TraytorOutputChannel;
  private extensionUri: Uri;
  private viewMode: 'type' | 'status' = 'type';
  private searchQuery: string = '';

  constructor(outputChannel: TraytorOutputChannel, extensionUri: Uri) {
    this.outputChannel = outputChannel;
    this.extensionUri = extensionUri;
  }

  refresh(): void {
    this.loadTasks().catch((err) => {
      this.outputChannel.appendLine(
        `Failed to refresh tasks: ${err instanceof Error ? err.message : String(err)}`
      );
    });
    this._onDidChangeTreeData.fire(undefined);
  }

  setViewMode(mode: 'type' | 'status'): void {
    this.viewMode = mode;
    this.refresh();
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.refresh();
  }

  async loadTasks(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('traytor');
      const cliPath = config.get<string>('cliPath', 'traytor');
      const cwd =
        config.get<string>('workingDirectory') ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      const result = await execFileAsync(cliPath, ['history', '--output', 'json'], {
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 1024 * 1024 * 5,
        cwd: cwd ?? undefined,
      });

      const stdout = (result as { stdout: string }).stdout;
      if (!stdout || stdout.trim().length === 0) {
        this.tasks = [];
        return;
      }

      let data: unknown;
      try {
        data = JSON.parse(stdout);
      } catch {
        this.outputChannel.appendLine('Failed to parse task data: invalid JSON');
        this.tasks = [];
        return;
      }

      if (!Array.isArray(data)) {
        this.tasks = [];
        return;
      }

      this.tasks = data
        .filter(
          (item: Record<string, unknown>) =>
            typeof item.id === 'string' && typeof item.query === 'string'
        )
        .map(
          (item: Record<string, unknown>): TraytorTask => ({
            id: item.id as string,
            query: item.query as string,
            status: this.normalizeStatus(item.status as string),
            type: (item.type as string) || 'plan',
            createdAt: item.createdAt as string | undefined,
            updatedAt: item.updatedAt as string | undefined,
            phases: Array.isArray(item.phases)
              ? (item.phases as Record<string, unknown>[]).map((p) => ({
                  order: (p.order as number) || 0,
                  name: (p.name as string) || '',
                  description: (p.description as string) || '',
                  status: (p.status as string) || 'pending',
                }))
              : undefined,
            verification: item.verification
              ? (item.verification as {
                  comments: { id: string; category: string; message: string; status: string }[];
                  summary: string;
                })
              : undefined,
          })
        )
        .sort((a, b) => {
          const dateA = a.updatedAt || a.createdAt || '';
          const dateB = b.updatedAt || b.createdAt || '';
          return dateB.localeCompare(dateA);
        });
    } catch (error) {
      this.outputChannel.appendLine(
        `Failed to load tasks: ${error instanceof Error ? error.message : String(error)}`
      );
      this.tasks = [];
    }
  }

  getTreeItem(element: TreeElement): TreeItem {
    if ('type' in element) {
      const group = element as GroupNode | StatusGroupNode;
      const item = new TreeItem(group.label, TreeItemCollapsibleState.Expanded);
      item.iconPath = new ThemeIcon(group.icon);
      item.contextValue = `${group.type}Node`;
      return item;
    }

    if ('order' in element) {
      const phase = element as PhaseInfo;
      const item = new TreeItem(`${phase.order}. ${phase.name}`, TreeItemCollapsibleState.None);
      item.description = phase.status.replace('_', ' ');
      item.tooltip = phase.description;
      item.contextValue = `phase-${phase.status}`;
      item.iconPath = new ThemeIcon(this.getPhaseIcon(phase.status));
      return item;
    }

    const task = element as TraytorTask;
    const hasChildren = task.phases && task.phases.length > 0;
    const item = new TreeItem(
      task.query,
      hasChildren ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
    );

    item.iconPath = new ThemeIcon(this.getTaskIcon(task.status));
    item.description = this.getTaskDescription(task);
    item.tooltip = this.getTaskTooltip(task);
    item.contextValue = `traytorTask-${task.status}${hasChildren ? '-with-phases' : ''}`;

    item.command = {
      command: 'traytor.showTaskDetails',
      title: 'Show Task Details',
      arguments: [{ id: task.id, query: task.query, status: task.status, task }],
    };

    return item;
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) {
      return this.getRootElements();
    }

    if ('type' in element && element.type === 'group') {
      const groupType = element.id.replace('group-', '');
      const filtered = this.tasks.filter((t) => t.type === groupType);
      return this.filterBySearch(filtered);
    }

    if ('type' in element && element.type === 'status-group') {
      const status = element.status;
      const filtered = this.tasks.filter((t) => t.status === status);
      return this.filterBySearch(filtered);
    }

    if ('order' in element) {
      return [];
    }

    const task = element as TraytorTask;
    if (task.phases && task.phases.length > 0) {
      return task.phases.sort((a, b) => a.order - b.order);
    }

    return [];
  }

  getTask(id: string): TraytorTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  getAllTasks(): TraytorTask[] {
    return this.tasks;
  }

  private getRootElements(): TreeElement[] {
    const filteredTasks = this.filterBySearch(this.tasks);

    if (this.viewMode === 'type') {
      const groups: Map<string, GroupNode> = new Map([
        ['plan', { id: 'group-plan', label: 'Plans', icon: 'list-unordered', type: 'group' }],
        ['phases', { id: 'group-phases', label: 'Phases', icon: 'git-branch', type: 'group' }],
        ['review', { id: 'group-review', label: 'Reviews', icon: 'search', type: 'group' }],
        ['epic', { id: 'group-epic', label: 'Epics', icon: 'project', type: 'group' }],
      ]);

      const hasTasksOfType = new Set(filteredTasks.map((t) => t.type));
      const rootElements: TreeElement[] = [];
      for (const [type, node] of groups) {
        if (hasTasksOfType.has(type)) {
          rootElements.push(node);
        }
      }
      return rootElements;
    }

    const statusGroups: StatusGroupNode[] = [
      {
        id: 'status-in_progress',
        label: 'In Progress',
        icon: 'sync~spin',
        type: 'status-group',
        status: 'in_progress',
      },
      {
        id: 'status-pending',
        label: 'Pending',
        icon: 'clock',
        type: 'status-group',
        status: 'pending',
      },
      {
        id: 'status-completed',
        label: 'Completed',
        icon: 'pass-filled',
        type: 'status-group',
        status: 'completed',
      },
      {
        id: 'status-failed',
        label: 'Failed',
        icon: 'error',
        type: 'status-group',
        status: 'failed',
      },
    ];

    const hasStatus = new Set<string>(filteredTasks.map((t) => t.status));
    return statusGroups.filter((g) => hasStatus.has(g.status));
  }

  private getTaskDescription(task: TraytorTask): string {
    const parts: string[] = [];
    if (task.type && task.type !== 'plan') {
      parts.push(task.type);
    }
    parts.push(task.status.replace('_', ' '));
    if (task.phases && task.phases.length > 0) {
      const done = task.phases.filter((p) => p.status === 'completed').length;
      parts.push(`${done}/${task.phases.length}`);
    }
    return parts.join(' · ');
  }

  private getTaskTooltip(task: TraytorTask): string {
    const lines = [
      `ID: ${task.id}`,
      `Status: ${task.status.replace('_', ' ')}`,
      `Type: ${task.type || 'plan'}`,
    ];
    if (task.createdAt) lines.push(`Created: ${new Date(task.createdAt).toLocaleString()}`);
    if (task.updatedAt) lines.push(`Updated: ${new Date(task.updatedAt).toLocaleString()}`);
    if (task.phases && task.phases.length > 0) {
      lines.push(`Phases: ${task.phases.length}`);
    }
    if (task.verification) {
      const open = task.verification.comments.filter((c) => c.status === 'open').length;
      lines.push(`Verification: ${open} open issues`);
    }
    return lines.join('\n');
  }

  private getTaskIcon(status: string): string {
    switch (status) {
      case 'completed':
        return 'pass-filled';
      case 'in_progress':
        return 'sync~spin';
      case 'failed':
        return 'error';
      default:
        return 'clock';
    }
  }

  private getPhaseIcon(status: string): string {
    switch (status) {
      case 'completed':
        return 'pass-filled';
      case 'in_progress':
        return 'sync~spin';
      case 'failed':
        return 'error';
      default:
        return 'circle-outline';
    }
  }

  private normalizeStatus(status: string): TraytorTask['status'] {
    const validStatuses: TraytorTask['status'][] = [
      'pending',
      'in_progress',
      'completed',
      'failed',
    ];
    if (validStatuses.includes(status as TraytorTask['status'])) {
      return status as TraytorTask['status'];
    }
    return 'pending';
  }

  private filterBySearch(tasks: TraytorTask[]): TraytorTask[] {
    if (!this.searchQuery) return tasks;
    return tasks.filter(
      (t) =>
        t.query.toLowerCase().includes(this.searchQuery) ||
        t.id.toLowerCase().includes(this.searchQuery) ||
        (t.type || '').toLowerCase().includes(this.searchQuery)
    );
  }
}
