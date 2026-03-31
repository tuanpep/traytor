import * as vscode from 'vscode';
import { execSync } from 'child_process';
import type { SddTaskProvider } from './task-provider.js';
import type { SddOutputChannel } from './output-channel.js';

function getSddPath(): string {
  return 'sdd';
}

function runSddCommand(args: string, timeout = 120000): string {
  try {
    return execSync(`${getSddPath()} ${args}`, {
      encoding: 'utf-8',
      timeout,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SDD command failed: ${message}`);
  }
}

export function registerCommands(
  context: vscode.ExtensionContext,
  taskProvider: SddTaskProvider,
  outputChannel: SddOutputChannel
): void {
  // SDD: Create Plan
  context.subscriptions.push(
    vscode.commands.registerCommand('sdd.createPlan', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Enter task description to plan',
        placeHolder: 'e.g., Implement user authentication',
        title: 'SDD: Create Plan',
      });

      if (!query) return;

      outputChannel.show();
      outputChannel.appendLine(`Creating plan for: ${query}`);

      try {
        const result = runSddCommand(`plan "${query.replace(/"/g, '\\"')}"`);
        outputChannel.appendLine(result);

        // Show result in a new document
        const doc = await vscode.workspace.openTextDocument({
          content: result,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc);

        vscode.window.showInformationMessage('Plan created successfully');
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to create plan: ${message}`);
      }
    })
  );

  // SDD: Execute Task
  context.subscriptions.push(
    vscode.commands.registerCommand('sdd.executeTask', async (taskId?: string) => {
      let targetTaskId = taskId;

      if (!targetTaskId) {
        const tasks = taskProvider.getChildren();
        if (tasks.length === 0) {
          vscode.window.showWarningMessage('No tasks available. Create a plan first.');
          return;
        }

        const items = tasks.map((t) => ({
          label: t.query,
          description: `[${t.status}] ${t.id}`,
          taskId: t.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a task to execute',
          title: 'SDD: Execute Task',
        });

        if (!selected) return;
        targetTaskId = selected.taskId;
      }

      outputChannel.show();
      outputChannel.appendLine(`Executing task: ${targetTaskId}`);

      try {
        const result = runSddCommand(`exec ${targetTaskId}`, 300000);
        outputChannel.appendLine(result);
        vscode.window.showInformationMessage(`Task ${targetTaskId} executed successfully`);
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to execute task: ${message}`);
      }
    })
  );

  // SDD: Verify Task
  context.subscriptions.push(
    vscode.commands.registerCommand('sdd.verifyTask', async (taskId?: string) => {
      let targetTaskId = taskId;

      if (!targetTaskId) {
        const tasks = taskProvider.getChildren();
        if (tasks.length === 0) {
          vscode.window.showWarningMessage('No tasks available. Create a plan first.');
          return;
        }

        const items = tasks
          .filter((t) => t.status === 'in_progress' || t.status === 'completed')
          .map((t) => ({
            label: t.query,
            description: `[${t.status}] ${t.id}`,
            taskId: t.id,
          }));

        if (items.length === 0) {
          vscode.window.showInformationMessage('No tasks available for verification.');
          return;
        }

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a task to verify',
          title: 'SDD: Verify Task',
        });

        if (!selected) return;
        targetTaskId = selected.taskId;
      }

      outputChannel.show();
      outputChannel.appendLine(`Verifying task: ${targetTaskId}`);

      try {
        const result = runSddCommand(`verify ${targetTaskId}`);
        outputChannel.appendLine(result);
        vscode.window.showInformationMessage(`Task ${targetTaskId} verified`);
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to verify task: ${message}`);
      }
    })
  );

  // SDD: Show History
  context.subscriptions.push(
    vscode.commands.registerCommand('sdd.showHistory', async () => {
      outputChannel.show();
      outputChannel.appendLine('Loading task history...');

      try {
        const result = runSddCommand('history');
        outputChannel.appendLine(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to load history: ${message}`);
      }
    })
  );

  // SDD: Refresh Tasks
  context.subscriptions.push(
    vscode.commands.registerCommand('sdd.refreshTasks', () => {
      taskProvider.refresh();
    })
  );
}
