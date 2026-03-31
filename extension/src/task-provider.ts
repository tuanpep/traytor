import * as path from 'path';
import { execSync } from 'child_process';
import { EventEmitter, TreeItem, TreeItemCollapsibleState } from 'vscode';
import type { SddOutputChannel } from './output-channel.js';

export interface SddTask {
  id: string;
  query: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export class SddTaskProvider {
  private _onDidChangeTreeData = new EventEmitter<SddTask | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private tasks: SddTask[] = [];
  private outputChannel: SddOutputChannel;

  constructor(outputChannel: SddOutputChannel) {
    this.outputChannel = outputChannel;
  }

  refresh(): void {
    this.loadTasks();
    this._onDidChangeTreeData.fire(undefined);
  }

  async loadTasks(): Promise<void> {
    try {
      const result = execSync('sdd history --output json 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 10000,
      });

      const data = JSON.parse(result);
      this.tasks = Array.isArray(data) ? data : [];
    } catch {
      this.tasks = [];
    }
  }

  getTreeItem(element: SddTask): TreeItem {
    const item = new TreeItem(element.query, TreeItemCollapsibleState.None);

    item.iconPath = this.getStatusIcon(element.status);
    item.tooltip = `${element.id} - ${element.status}`;
    item.description = element.status.replace('_', ' ');
    item.contextValue = `sddTask-${element.status}`;

    item.command = {
      command: 'sdd.executeTask',
      title: 'Execute Task',
      arguments: [element.id],
    };

    return item;
  }

  getChildren(): SddTask[] {
    return this.tasks;
  }

  private getStatusIcon(status: string): { light: string; dark: string } {
    const iconPath = path.join(__dirname, '..', 'media');
    switch (status) {
      case 'completed':
        return {
          light: path.join(iconPath, 'status-completed-light.svg'),
          dark: path.join(iconPath, 'status-completed-dark.svg'),
        };
      case 'in_progress':
        return {
          light: path.join(iconPath, 'status-in-progress-light.svg'),
          dark: path.join(iconPath, 'status-in-progress-dark.svg'),
        };
      case 'failed':
        return {
          light: path.join(iconPath, 'status-failed-light.svg'),
          dark: path.join(iconPath, 'status-failed-dark.svg'),
        };
      default:
        return {
          light: path.join(iconPath, 'status-pending-light.svg'),
          dark: path.join(iconPath, 'status-pending-dark.svg'),
        };
    }
  }
}
