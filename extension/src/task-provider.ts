import { exec } from 'child_process';
import { EventEmitter, TreeItem, TreeItemCollapsibleState, Uri } from 'vscode';
import type { TraytorOutputChannel } from './output-channel.js';

export interface TraytorTask {
  id: string;
  query: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export class TraytorTaskProvider {
  private _onDidChangeTreeData = new EventEmitter<TraytorTask | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private tasks: TraytorTask[] = [];
  private outputChannel: TraytorOutputChannel;
  private extensionUri: Uri;

  constructor(outputChannel: TraytorOutputChannel, extensionUri: Uri) {
    this.outputChannel = outputChannel;
    this.extensionUri = extensionUri;
  }

  refresh(): void {
    this.loadTasks();
    this._onDidChangeTreeData.fire(undefined);
  }

  async loadTasks(): Promise<void> {
    try {
      const result = await new Promise<string>((resolve, reject) => {
        exec(
          'traytor history --output json',
          {
            encoding: 'utf-8',
            timeout: 10000,
            maxBuffer: 1024 * 1024 * 5,
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(stderr || error.message));
            } else {
              resolve(stdout);
            }
          }
        );
      });

      const data = JSON.parse(result);
      this.tasks = Array.isArray(data) ? data : [];
    } catch (error) {
      this.outputChannel.appendLine(
        `Failed to load tasks: ${error instanceof Error ? error.message : String(error)}`
      );
      this.tasks = [];
    }
  }

  getTreeItem(element: TraytorTask): TreeItem {
    const item = new TreeItem(element.query, TreeItemCollapsibleState.None);

    item.iconPath = this.getStatusIcon(element.status);
    item.tooltip = `${element.id} - ${element.status}`;
    item.description = element.status.replace('_', ' ');
    item.contextValue = `traytorTask-${element.status}`;

    item.command = {
      command: 'traytor.executeTask',
      title: 'Execute Task',
      arguments: [element.id],
    };

    return item;
  }

  getChildren(): TraytorTask[] {
    return this.tasks;
  }

  private getStatusIcon(status: string): { light: Uri; dark: Uri } {
    const mediaPath = Uri.joinPath(this.extensionUri, 'media');
    switch (status) {
      case 'completed':
        return {
          light: Uri.joinPath(mediaPath, 'status-completed-light.svg'),
          dark: Uri.joinPath(mediaPath, 'status-completed-dark.svg'),
        };
      case 'in_progress':
        return {
          light: Uri.joinPath(mediaPath, 'status-in-progress-light.svg'),
          dark: Uri.joinPath(mediaPath, 'status-in-progress-dark.svg'),
        };
      case 'failed':
        return {
          light: Uri.joinPath(mediaPath, 'status-failed-light.svg'),
          dark: Uri.joinPath(mediaPath, 'status-failed-dark.svg'),
        };
      default:
        return {
          light: Uri.joinPath(mediaPath, 'status-pending-light.svg'),
          dark: Uri.joinPath(mediaPath, 'status-pending-dark.svg'),
        };
    }
  }
}
