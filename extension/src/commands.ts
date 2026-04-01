import * as vscode from 'vscode';
import { execFile } from 'child_process';
import type { TraytorTaskProvider } from './task-provider.js';
import type { TraytorOutputChannel } from './output-channel.js';

function getTraytorPath(): string {
  return 'traytor';
}

function validateInput(input: string, fieldName: string): void {
  if (input.includes('\0')) {
    throw new Error(`${fieldName} contains null bytes`);
  }
  if (input.includes('\n')) {
    throw new Error(`${fieldName} contains newlines`);
  }
}

function runTraytorCommandAsync(args: string[], timeout = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      getTraytorPath(),
      args,
      {
        encoding: 'utf-8',
        timeout,
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        maxBuffer: 1024 * 1024 * 10,
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
}

export function registerCommands(
  context: vscode.ExtensionContext,
  taskProvider: TraytorTaskProvider,
  outputChannel: TraytorOutputChannel
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.createPlan', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Enter task description to plan',
        placeHolder: 'e.g., Implement user authentication',
        title: 'Traytor: Create Plan',
      });

      if (!query) return;

      try {
        validateInput(query, 'Query');
      } catch (validationError) {
        const message = validationError instanceof Error ? validationError.message : String(validationError);
        vscode.window.showErrorMessage(`Invalid input: ${message}`);
        return;
      }

      outputChannel.show();
      outputChannel.appendLine(`Creating plan for: ${query}`);

      try {
        const result = await runTraytorCommandAsync(['plan', query]);
        outputChannel.appendLine(result);

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

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.executeTask', async (taskId?: string) => {
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
          title: 'Traytor: Execute Task',
        });

        if (!selected) return;
        targetTaskId = selected.taskId;
      }

      outputChannel.show();
      outputChannel.appendLine(`Executing task: ${targetTaskId}`);

      try {
        const result = await runTraytorCommandAsync(['exec', targetTaskId], 300000);
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

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.verifyTask', async (taskId?: string) => {
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
          title: 'Traytor: Verify Task',
        });

        if (!selected) return;
        targetTaskId = selected.taskId;
      }

      outputChannel.show();
      outputChannel.appendLine(`Verifying task: ${targetTaskId}`);

      try {
        const result = await runTraytorCommandAsync(['verify', targetTaskId]);
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

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.showHistory', async () => {
      outputChannel.show();
      outputChannel.appendLine('Loading task history...');

      try {
        const result = await runTraytorCommandAsync(['history']);
        outputChannel.appendLine(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to load history: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.refreshTasks', () => {
      taskProvider.refresh();
    })
  );
}
