import * as vscode from 'vscode';
import { TraytorTaskProvider } from './task-provider.js';
import { TraytorOutputChannel } from './output-channel.js';
import { registerCommands } from './commands.js';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = new TraytorOutputChannel();
  const taskProvider = new TraytorTaskProvider(outputChannel, context.extensionUri);

  const treeView = vscode.window.createTreeView('traytorTasksView', {
    treeDataProvider: taskProvider,
  });

  registerCommands(context, taskProvider, outputChannel);

  context.subscriptions.push(treeView, outputChannel);

  outputChannel.appendLine('Traytor extension activated');

  taskProvider.loadTasks();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      taskProvider.loadTasks();
    })
  );
}

export function deactivate() {
  // Cleanup on deactivation
}
