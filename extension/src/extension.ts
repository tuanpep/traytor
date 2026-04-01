import * as vscode from 'vscode';
import { TraytorTaskProvider } from './task-provider.js';
import { TraytorOutputChannel } from './output-channel.js';
import { registerCommands } from './commands.js';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = new TraytorOutputChannel();
  const taskProvider = new TraytorTaskProvider(outputChannel, context.extensionUri);

  const treeView = vscode.window.createTreeView('traytorTasksView', {
    treeDataProvider: taskProvider,
    showCollapseAll: true,
  });

  registerCommands(context, taskProvider, outputChannel);

  // Status bar item showing last task status
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.name = 'Traytor Status';
  statusBar.command = 'traytor.showHistory';
  statusBar.tooltip = 'Traytor: Click to view task history';
  statusBar.text = '$(checklist) Traytor';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Update status bar after tasks load
  const updateStatusBar = () => {
    const tasks = taskProvider.getAllTasks();
    if (tasks.length === 0) {
      statusBar.text = '$(checklist) Traytor';
      statusBar.tooltip = 'Traytor: No tasks. Create a plan to get started.';
      return;
    }
    const latest = tasks[0];
    const icon =
      latest.status === 'completed'
        ? '$(check)'
        : latest.status === 'failed'
          ? '$(error)'
          : latest.status === 'in_progress'
            ? '$(sync~spin)'
            : '$(clock)';
    statusBar.text = `${icon} ${latest.query.substring(0, 30)}${latest.query.length > 30 ? '...' : ''}`;
    statusBar.tooltip = `Traytor: ${latest.query}\nStatus: ${latest.status.replace('_', ' ')}\nID: ${latest.id}`;
  };

  context.subscriptions.push(
    treeView,
    outputChannel,
    taskProvider.onDidChangeTreeData(updateStatusBar)
  );

  outputChannel.appendLine('Traytor extension activated');

  taskProvider
    .loadTasks()
    .then(updateStatusBar)
    .catch((err) => {
      outputChannel.appendLine(
        `Failed to load tasks on activation: ${err instanceof Error ? err.message : String(err)}`
      );
    });

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      taskProvider
        .loadTasks()
        .then(updateStatusBar)
        .catch((err) => {
          outputChannel.appendLine(
            `Failed to reload tasks: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
      if (doc.uri.fsPath.includes('.traytor') || doc.uri.fsPath.includes('traytor')) {
        taskProvider
          .loadTasks()
          .then(updateStatusBar)
          .catch(() => {});
      }
    })
  );
}

export function deactivate() {}
