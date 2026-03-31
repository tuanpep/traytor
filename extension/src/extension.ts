import * as vscode from 'vscode';
import { SddTaskProvider } from './task-provider.js';
import { SddOutputChannel } from './output-channel.js';
import { registerCommands } from './commands.js';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = new SddOutputChannel();
  const taskProvider = new SddTaskProvider(outputChannel);

  // Register tree data provider for sidebar
  const treeView = vscode.window.createTreeView('sddTasksView', {
    treeDataProvider: taskProvider,
  });

  // Register commands
  registerCommands(context, taskProvider, outputChannel);

  // Push to subscriptions for cleanup
  context.subscriptions.push(treeView, outputChannel);

  outputChannel.appendLine('SDD extension activated');
}

export function deactivate() {
  // Cleanup on deactivation
}
