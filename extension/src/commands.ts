import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TraytorTaskProvider, TraytorTask } from './task-provider.js';
import type { TraytorOutputChannel } from './output-channel.js';

const execFileAsync = promisify(execFile);

function getTraytorPath(): string {
  const config = vscode.workspace.getConfiguration('traytor');
  return config.get<string>('cliPath', 'traytor');
}

function getCwd(): string | undefined {
  const config = vscode.workspace.getConfiguration('traytor');
  const customCwd = config.get<string>('workingDirectory');
  if (customCwd) return customCwd;
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getTimeouts(): {
  plan: number;
  exec: number;
  verify: number;
  history: number;
  review: number;
  phases: number;
  epic: number;
  workflow: number;
  mermaid: number;
} {
  const config = vscode.workspace.getConfiguration('traytor');
  return {
    plan: config.get<number>('timeout.plan', 120000),
    exec: config.get<number>('timeout.exec', 300000),
    verify: config.get<number>('timeout.verify', 120000),
    history: config.get<number>('timeout.history', 10000),
    review: config.get<number>('timeout.review', 180000),
    phases: config.get<number>('timeout.phases', 180000),
    epic: config.get<number>('timeout.epic', 300000),
    workflow: config.get<number>('timeout.workflow', 60000),
    mermaid: config.get<number>('timeout.mermaid', 60000),
  };
}

async function checkTraytorInstalled(): Promise<boolean> {
  try {
    await execFileAsync(getTraytorPath(), ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureTraytorInstalled(outputChannel: TraytorOutputChannel): Promise<boolean> {
  const installed = await checkTraytorInstalled();
  if (!installed) {
    const action = await vscode.window.showErrorMessage(
      'Traytor CLI not found. Please install it or configure the path in settings.',
      'Install CLI',
      'Open Settings'
    );
    if (action === 'Install CLI') {
      const terminal = vscode.window.createTerminal('Traytor Install');
      terminal.sendText('npm install -g traytor');
      terminal.show();
    } else if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'traytor.cliPath');
    }
    return false;
  }
  return true;
}

function validateInput(input: string, fieldName: string): void {
  if (!input || input.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  if (input.includes('\0')) {
    throw new Error(`${fieldName} contains null bytes`);
  }
  // Allow-list: only safe characters for CLI arguments
  // Permits: alphanumeric, spaces, hyphens, underscores, dots, forward slashes,
  // colons, parens, brackets, commas, equals, quotes, plus, hash, at, tilde
  const safePattern = /^[a-zA-Z0-9\s\-_.\/:()\[\],=+'"#@~]*$/;
  if (!safePattern.test(input)) {
    throw new Error(
      `${fieldName} contains invalid characters. Only alphanumeric, spaces, hyphens, underscores, dots, slashes, and basic punctuation are allowed.`
    );
  }
}

async function runCommand(
  title: string,
  action: string,
  args: string[],
  outputChannel: TraytorOutputChannel,
  timeoutMs: number,
  showOutput = true
): Promise<string> {
  outputChannel.appendLine(`[${new Date().toISOString()}] ${action}`);
  const cwd = getCwd();
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Traytor: ${title}`,
      cancellable: false,
    },
    () =>
      execFileAsync(getTraytorPath(), args, {
        encoding: 'utf-8',
        timeout: timeoutMs,
        cwd: cwd ?? undefined,
        maxBuffer: 1024 * 1024 * 10,
      })
  );
  const stdout = (result as { stdout: string; stderr: string }).stdout;
  if (showOutput) {
    outputChannel.appendLine(stdout);
  }
  return stdout;
}

async function pickTask(
  taskProvider: TraytorTaskProvider,
  placeHolder: string,
  filter?: (t: { id: string; query: string; status: string }) => boolean
): Promise<{ id: string; query: string; status: string } | undefined> {
  const tasks = taskProvider.getAllTasks();
  if (tasks.length === 0) {
    vscode.window.showWarningMessage('No tasks available.');
    return undefined;
  }
  const filtered = filter ? tasks.filter(filter) : tasks;
  if (filtered.length === 0) {
    vscode.window.showInformationMessage('No matching tasks.');
    return undefined;
  }
  const items = filtered.map((t) => ({
    label: t.query,
    description: `[${t.status}] ${t.id}`,
    task: t,
  }));
  const selected = await vscode.window.showQuickPick(items, { placeHolder });
  return selected?.task;
}

async function pickFiles(): Promise<string[] | undefined> {
  const files = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    openLabel: 'Select Files',
  });
  if (!files) return undefined;
  return files.map((f) => f.fsPath);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  taskProvider: TraytorTaskProvider,
  outputChannel: TraytorOutputChannel
): void {
  // ─── Setup ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.setup', async () => {
      outputChannel.show();
      outputChannel.appendLine('Starting Traytor setup...');

      const config = vscode.workspace.getConfiguration('traytor');
      const provider = await vscode.window.showQuickPick(
        [
          { label: 'anthropic', description: 'Anthropic Claude (recommended)' },
          { label: 'openai', description: 'OpenAI GPT' },
          { label: 'openai-compatible', description: 'OpenAI Compatible API' },
        ],
        { placeHolder: 'Select your LLM provider', title: 'Traytor Setup: Provider' }
      );

      if (!provider) return;

      await config.update('provider', provider.label, vscode.ConfigurationTarget.Global);

      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${provider.label} API key`,
        password: true,
        ignoreFocusOut: true,
        title: 'Traytor Setup: API Key',
      });

      if (apiKey) {
        await config.update(`apiKey.${provider.label}`, apiKey, vscode.ConfigurationTarget.Global);
        outputChannel.appendLine('API key saved to VS Code settings');
      }

      vscode.window.showInformationMessage('Traytor setup complete! You can now create plans.');
    })
  );

  // ─── Plan ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.createPlan', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      if (!getCwd()) {
        vscode.window.showWarningMessage('Please open a workspace folder first.');
        return;
      }

      const query = await vscode.window.showInputBox({
        prompt: 'Enter task description to plan',
        placeHolder: 'e.g., Implement user authentication',
        title: 'Traytor: Create Plan',
        ignoreFocusOut: true,
      });

      if (!query) return;

      try {
        validateInput(query, 'Query');
      } catch (validationError) {
        const message =
          validationError instanceof Error ? validationError.message : String(validationError);
        vscode.window.showErrorMessage(`Invalid input: ${message}`);
        return;
      }

      const useFiles = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Include specific files in analysis?',
        title: 'Traytor: Plan Options',
      });

      const args = ['plan', query];
      if (useFiles === 'Yes') {
        const files = await pickFiles();
        if (files) {
          args.push('--files', ...files);
        }
      }

      try {
        const result = await runCommand(
          'Creating plan...',
          `Creating plan for: ${query}`,
          args,
          outputChannel,
          getTimeouts().plan
        );

        const doc = await vscode.workspace.openTextDocument({
          content: result,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc);

        vscode.window.showInformationMessage('Plan created successfully');
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to create plan: ${message}`);
      }
    })
  );

  // ─── Phases ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.phases', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      if (!getCwd()) {
        vscode.window.showWarningMessage('Please open a workspace folder first.');
        return;
      }

      const query = await vscode.window.showInputBox({
        prompt: 'Enter complex task to break into phases',
        placeHolder: 'e.g., Build a complete CRUD REST API with auth, validation, and tests',
        title: 'Traytor: Create Phases',
        ignoreFocusOut: true,
      });

      if (!query) return;

      try {
        validateInput(query, 'Query');
        await runCommand(
          'Creating phases...',
          `Creating phases for: ${query}`,
          ['phases', query],
          outputChannel,
          getTimeouts().phases
        );
        vscode.window.showInformationMessage('Phases created successfully');
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create phases: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.phasesList', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select a phases task');
      if (!task) return;

      try {
        await runCommand(
          'Listing phases...',
          `Listing phases for: ${task.id}`,
          ['phases:list', task.id],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to list phases: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.phasesAdd', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select a phases task');
      if (!task) return;

      const phaseTitle = await vscode.window.showInputBox({
        prompt: 'Enter phase title',
        title: 'Traytor: Add Phase',
        ignoreFocusOut: true,
      });
      if (!phaseTitle) return;

      const phaseDesc = await vscode.window.showInputBox({
        prompt: 'Enter phase description',
        title: 'Traytor: Add Phase',
        ignoreFocusOut: true,
      });

      try {
        const args = ['phases:add', task.id, '--title', phaseTitle];
        if (phaseDesc) args.push('--description', phaseDesc);
        await runCommand(
          'Adding phase...',
          `Adding phase to: ${task.id}`,
          args,
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('Phase added');
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to add phase: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.phasesDelete', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select a phases task');
      if (!task) return;

      const phaseOrder = await vscode.window.showInputBox({
        prompt: 'Enter phase order number to delete',
        title: 'Traytor: Delete Phase',
        ignoreFocusOut: true,
      });
      if (!phaseOrder) return;

      try {
        await runCommand(
          'Deleting phase...',
          `Deleting phase ${phaseOrder} from: ${task.id}`,
          ['phases:delete', task.id, phaseOrder],
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('Phase deleted');
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to delete phase: ${message}`);
      }
    })
  );

  // ─── Exec ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.executeTask', async (taskId?: string) => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      let targetTaskId = taskId;

      if (!targetTaskId) {
        const task = await pickTask(taskProvider, 'Select a task to execute');
        if (!task) return;
        targetTaskId = task.id;
      }

      const execWithPhase = await vscode.window.showQuickPick(['No', 'Yes'], {
        placeHolder: 'Execute a specific phase?',
        title: 'Traytor: Execute Options',
      });

      const args = ['exec', targetTaskId];
      if (execWithPhase === 'Yes') {
        const phase = await vscode.window.showInputBox({
          prompt: 'Enter phase number',
          title: 'Traytor: Execute Phase',
          ignoreFocusOut: true,
        });
        if (phase) args.push('--phase', phase);
      }

      try {
        await runCommand(
          'Executing task...',
          `Executing task: ${targetTaskId}`,
          args,
          outputChannel,
          getTimeouts().exec
        );
        vscode.window.showInformationMessage(`Task ${targetTaskId} executed successfully`);
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to execute task: ${message}`);
      }
    })
  );

  // ─── YOLO ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.yolo', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select a phases task to run YOLO mode');
      if (!task) return;

      const autoCommit = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Auto-commit after each phase?',
        title: 'Traytor: YOLO Options',
      });

      const args = ['yolo', task.id];
      if (autoCommit === 'Yes') args.push('--auto-commit');

      const confirm = await vscode.window.showWarningMessage(
        `YOLO mode will execute all phases automatically for: ${task.query}. Continue?`,
        { modal: true },
        'Start YOLO'
      );

      if (confirm !== 'Start YOLO') return;

      try {
        await runCommand(
          'Running YOLO mode...',
          `YOLO: ${task.id}`,
          args,
          outputChannel,
          getTimeouts().exec * 10
        );
        vscode.window.showInformationMessage('YOLO mode completed');
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`YOLO mode failed: ${message}`);
      }
    })
  );

  // ─── Verify ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.verifyTask', async (taskId?: string) => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      let targetTaskId = taskId;

      if (!targetTaskId) {
        const task = await pickTask(
          taskProvider,
          'Select a task to verify',
          (t) => t.status === 'in_progress' || t.status === 'completed'
        );
        if (!task) return;
        targetTaskId = task.id;
      }

      const verifyMode = await vscode.window.showQuickPick(
        ['verify', 'verify + fix', 'verify + fix all'],
        { placeHolder: 'Select verification mode', title: 'Traytor: Verify Options' }
      );

      const args = ['verify', targetTaskId];
      if (verifyMode === 'verify + fix') args.push('--fix');
      if (verifyMode === 'verify + fix all') args.push('--fix-all');

      try {
        await runCommand(
          'Verifying task...',
          `Verifying task: ${targetTaskId}`,
          args,
          outputChannel,
          getTimeouts().verify
        );
        vscode.window.showInformationMessage(`Task ${targetTaskId} verified`);
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to verify task: ${message}`);
      }
    })
  );

  // ─── Review ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.review', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const query = await vscode.window.showInputBox({
        prompt: 'Review focus (optional)',
        placeHolder: 'e.g., Focus on security and error handling',
        title: 'Traytor: Code Review',
      });

      const useFix = await vscode.window.showQuickPick(['No', 'Yes'], {
        placeHolder: 'Apply fixes automatically?',
        title: 'Traytor: Review Options',
      });

      const args = query ? ['review', query] : ['review'];
      if (useFix === 'Yes') args.push('--fix');

      try {
        await runCommand(
          'Running code review...',
          'Running code review',
          args,
          outputChannel,
          getTimeouts().review
        );
        vscode.window.showInformationMessage('Code review completed');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to run review: ${message}`);
      }
    })
  );

  // ─── Epic ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.epic', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const query = await vscode.window.showInputBox({
        prompt: 'Enter epic description',
        placeHolder: 'e.g., Build an e-commerce platform',
        title: 'Traytor: Create Epic',
        ignoreFocusOut: true,
      });

      if (!query) return;

      try {
        validateInput(query, 'Query');
        await runCommand(
          'Creating epic...',
          `Creating epic: ${query}`,
          ['epic', query],
          outputChannel,
          getTimeouts().epic
        );
        vscode.window.showInformationMessage('Epic created successfully');
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create epic: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.epicListSpecs', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(
        taskProvider,
        'Select an epic',
        (t) => t.query.toLowerCase().includes('epic') || t.id.startsWith('epic')
      );
      if (!task) return;

      try {
        await runCommand(
          'Listing specs...',
          `Specs for epic: ${task.id}`,
          ['epic', '--task-id', task.id, '--spec', 'list'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to list specs: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.epicCreateTicket', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select an epic', (t) => t.id.startsWith('epic'));
      if (!task) return;

      const title = await vscode.window.showInputBox({
        prompt: 'Ticket title',
        title: 'Traytor: Create Ticket',
        ignoreFocusOut: true,
      });
      if (!title) return;

      const description = await vscode.window.showInputBox({
        prompt: 'Ticket description',
        title: 'Traytor: Create Ticket',
        ignoreFocusOut: true,
      });

      try {
        const args = ['epic', '--task-id', task.id, '--ticket', 'create', '--ticket-title', title];
        if (description) args.push('--ticket-description', description);
        await runCommand(
          'Creating ticket...',
          `Creating ticket in epic: ${task.id}`,
          args,
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('Ticket created');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create ticket: ${message}`);
      }
    })
  );

  // ─── Epic Spec Management ─────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.epicCreateSpec', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select an epic', (t) => t.id.startsWith('epic'));
      if (!task) return;

      const specType = await vscode.window.showQuickPick(
        [
          { label: 'prd', description: 'Product Requirements Document' },
          { label: 'tech', description: 'Technical Design Document' },
          { label: 'design', description: 'Design Spec' },
          { label: 'api', description: 'API Spec' },
        ],
        { placeHolder: 'Select spec type', title: 'Traytor: Create Spec' }
      );
      if (!specType) return;

      const title = await vscode.window.showInputBox({
        prompt: 'Spec title',
        title: 'Traytor: Create Spec',
        ignoreFocusOut: true,
      });
      if (!title) return;

      try {
        await runCommand(
          'Creating spec...',
          `Creating ${specType.label} spec: ${title}`,
          [
            'epic',
            '--task-id',
            task.id,
            '--spec',
            'create',
            '--spec-type',
            specType.label,
            '--spec-title',
            title,
          ],
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('Spec created');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create spec: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.epicListTickets', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select an epic', (t) => t.id.startsWith('epic'));
      if (!task) return;

      try {
        await runCommand(
          'Listing tickets...',
          `Tickets for epic: ${task.id}`,
          ['epic', '--task-id', task.id, '--ticket', 'list'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to list tickets: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.epicUpdateTicketStatus', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select an epic', (t) => t.id.startsWith('epic'));
      if (!task) return;

      const ticketId = await vscode.window.showInputBox({
        prompt: 'Ticket ID',
        title: 'Traytor: Update Ticket Status',
        ignoreFocusOut: true,
      });
      if (!ticketId) return;

      const status = await vscode.window.showQuickPick(['todo', 'in_progress', 'done'], {
        placeHolder: 'Select new status',
        title: 'Traytor: Update Ticket Status',
      });
      if (!status) return;

      try {
        await runCommand(
          'Updating ticket...',
          `Updating ticket ${ticketId} to ${status}`,
          [
            'epic',
            '--task-id',
            task.id,
            '--ticket',
            'status',
            '--ticket-id',
            ticketId,
            '--ticket-status',
            status,
          ],
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('Ticket status updated');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to update ticket: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.epicBoard', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select an epic', (t) => t.id.startsWith('epic'));
      if (!task) return;

      const panel = vscode.window.createWebviewPanel(
        'traytorEpicBoard',
        `Epic Board: ${task.query.substring(0, 40)}...`,
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
            h2 { margin-top: 0; }
            .board { display: flex; gap: 16px; margin-top: 20px; }
            .column { flex: 1; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 8px; padding: 12px; }
            .column h3 { margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); }
            .ticket { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
            .ticket:hover { border-color: var(--vscode-focusBorder); }
            .ticket-title { font-weight: 600; margin-bottom: 4px; }
            .ticket-desc { font-size: 12px; color: var(--vscode-descriptionForeground); }
            .ticket-id { font-size: 11px; color: var(--vscode-textLink-foreground); margin-top: 4px; }
            .empty { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 13px; }
            .actions { margin-top: 20px; display: flex; gap: 8px; }
            .actions button { padding: 6px 14px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h2>${task.query}</h2>
          <p style="color: var(--vscode-descriptionForeground)">Epic Board - Click tickets to view details</p>
          <div class="board">
            <div class="column">
              <h3>📋 Todo</h3>
              <div class="empty">Load tickets to see them here</div>
            </div>
            <div class="column">
              <h3>🔄 In Progress</h3>
              <div class="empty">No tickets in progress</div>
            </div>
            <div class="column">
              <h3>✅ Done</h3>
              <div class="empty">No completed tickets</div>
            </div>
          </div>
          <div class="actions">
            <button onclick="refresh()">Refresh</button>
            <button onclick="addTicket()">Add Ticket</button>
          </div>
          <script>
            const vscode = acquireVsCodeApi();
            function refresh() { vscode.postMessage({ command: 'refresh', epicId: '${task.id}' }); }
            function addTicket() { vscode.postMessage({ command: 'addTicket', epicId: '${task.id}' }); }
          </script>
        </body>
        </html>
      `;

      panel.webview.onDidReceiveMessage(async (message: { command: string; epicId: string }) => {
        switch (message.command) {
          case 'refresh':
            panel.dispose();
            await vscode.commands.executeCommand('traytor.epicBoard');
            break;
          case 'addTicket':
            panel.dispose();
            await vscode.commands.executeCommand('traytor.epicCreateTicket');
            break;
        }
      });
    })
  );

  // ─── Workflow ───────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.workflowList', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      try {
        await runCommand(
          'Listing workflows...',
          'Listing workflows',
          ['workflow', 'list'],
          outputChannel,
          getTimeouts().workflow
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to list workflows: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.workflowCreate', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const name = await vscode.window.showInputBox({
        prompt: 'Workflow name',
        title: 'Traytor: Create Workflow',
        ignoreFocusOut: true,
      });
      if (!name) return;

      try {
        await runCommand(
          'Creating workflow...',
          `Creating workflow: ${name}`,
          ['workflow', 'create', name],
          outputChannel,
          getTimeouts().workflow
        );
        vscode.window.showInformationMessage('Workflow created');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create workflow: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.workflowAdvance', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      const workflowId = await vscode.window.showInputBox({
        prompt: 'Workflow ID to advance',
        title: 'Traytor: Advance Workflow',
        ignoreFocusOut: true,
      });
      if (!workflowId) return;
      try {
        await runCommand(
          'Advancing workflow...',
          `Advancing workflow: ${workflowId}`,
          ['workflow', 'advance', workflowId],
          outputChannel,
          getTimeouts().workflow
        );
        vscode.window.showInformationMessage('Workflow advanced');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to advance workflow: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.workflowState', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      const workflowId = await vscode.window.showInputBox({
        prompt: 'Workflow ID to check',
        title: 'Traytor: Workflow State',
        ignoreFocusOut: true,
      });
      if (!workflowId) return;
      try {
        await runCommand(
          'Getting workflow state...',
          `Workflow state: ${workflowId}`,
          ['workflow', 'state', workflowId],
          outputChannel,
          getTimeouts().workflow
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to get workflow state: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.workflowPause', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      const workflowId = await vscode.window.showInputBox({
        prompt: 'Workflow ID to pause',
        title: 'Traytor: Pause Workflow',
        ignoreFocusOut: true,
      });
      if (!workflowId) return;
      try {
        await runCommand(
          'Pausing workflow...',
          `Pausing workflow: ${workflowId}`,
          ['workflow', 'pause', workflowId],
          outputChannel,
          getTimeouts().workflow
        );
        vscode.window.showInformationMessage('Workflow paused');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to pause workflow: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.workflowResume', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      const workflowId = await vscode.window.showInputBox({
        prompt: 'Workflow ID to resume',
        title: 'Traytor: Resume Workflow',
        ignoreFocusOut: true,
      });
      if (!workflowId) return;
      try {
        await runCommand(
          'Resuming workflow...',
          `Resuming workflow: ${workflowId}`,
          ['workflow', 'resume', workflowId],
          outputChannel,
          getTimeouts().workflow
        );
        vscode.window.showInformationMessage('Workflow resumed');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to resume workflow: ${message}`);
      }
    })
  );

  // ─── Agent ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.agentList', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      try {
        await runCommand(
          'Listing agents...',
          'Listing agents',
          ['agent', 'list'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to list agents: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.agentAdd', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const name = await vscode.window.showInputBox({
        prompt: 'Agent name',
        title: 'Traytor: Add Agent',
        ignoreFocusOut: true,
      });
      if (!name) return;

      const command = await vscode.window.showInputBox({
        prompt: 'Agent command',
        placeHolder: 'e.g., claude',
        title: 'Traytor: Add Agent',
        ignoreFocusOut: true,
      });
      if (!command) return;

      try {
        await runCommand(
          'Adding agent...',
          `Adding agent: ${name}`,
          ['agent', 'add', name, '--command', command],
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('Agent added');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to add agent: ${message}`);
      }
    })
  );

  // ─── Template ───────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.templateList', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      try {
        await runCommand(
          'Listing templates...',
          'Listing templates',
          ['template', 'list'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to list templates: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.templateCreate', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const name = await vscode.window.showInputBox({
        prompt: 'Template name',
        title: 'Traytor: Create Template',
        ignoreFocusOut: true,
      });
      if (!name) return;

      const content = await vscode.window.showInputBox({
        prompt: 'Template content (Handlebars)',
        title: 'Traytor: Create Template',
        ignoreFocusOut: true,
      });
      if (!content) return;

      try {
        await runCommand(
          'Creating template...',
          `Creating template: ${name}`,
          ['template', 'create', name, '--content', content],
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('Template created');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create template: ${message}`);
      }
    })
  );

  // ─── Mermaid ────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.mermaidPlan', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const task = await pickTask(taskProvider, 'Select a task to generate Mermaid diagram');
      if (!task) return;

      try {
        const result = await runCommand(
          'Generating Mermaid diagram...',
          `Mermaid for: ${task.id}`,
          ['mermaid', 'plan', task.id],
          outputChannel,
          getTimeouts().mermaid
        );
        const doc = await vscode.workspace.openTextDocument({
          content: result,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to generate Mermaid diagram: ${message}`);
      }
    })
  );

  // ─── Ticket Assist ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.ticketAssist', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const action = await vscode.window.showQuickPick(['list', 'plan'], {
        placeHolder: 'Select action',
        title: 'Traytor: Ticket Assist',
      });
      if (!action) return;

      try {
        await runCommand(
          'Running ticket assist...',
          `Ticket assist: ${action}`,
          ['ticket-assist', action],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Ticket assist failed: ${message}`);
      }
    })
  );

  // ─── Git ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.gitStatus', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      try {
        await runCommand(
          'Git status...',
          'Git status',
          ['git', 'status'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Git status failed: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.gitDiff', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      try {
        await runCommand(
          'Git diff...',
          'Git diff',
          ['git', 'diff'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Git diff failed: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.gitCommit', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const message = await vscode.window.showInputBox({
        prompt: 'Commit message',
        title: 'Traytor: Git Commit',
        ignoreFocusOut: true,
      });
      if (!message) return;

      try {
        await runCommand(
          'Git commit...',
          `Commit: ${message}`,
          ['git', 'commit', '-m', message],
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('Changes committed');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Git commit failed: ${message}`);
      }
    })
  );

  // ─── Config ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.configShow', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      try {
        await runCommand(
          'Showing config...',
          'Current configuration',
          ['config', 'show'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to show config: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.configSetKey', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const provider = await vscode.window.showQuickPick(
        ['anthropic', 'openai', 'openai-compatible'],
        { placeHolder: 'Select provider', title: 'Traytor: Set API Key' }
      );
      if (!provider) return;

      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter ${provider} API key`,
        password: true,
        ignoreFocusOut: true,
        title: 'Traytor: Set API Key',
      });
      if (!apiKey) return;

      try {
        await runCommand(
          'Setting API key...',
          `Setting ${provider} API key`,
          ['config', 'set-key', provider, apiKey],
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage('API key saved');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to set API key: ${message}`);
      }
    })
  );

  // ─── Model Profile ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.modelProfileList', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;
      try {
        await runCommand(
          'Listing model profiles...',
          'Model profiles',
          ['model-profile', 'list'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to list model profiles: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.modelProfileSet', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      const profile = await vscode.window.showQuickPick(['balanced', 'frontier'], {
        placeHolder: 'Select model profile',
        title: 'Traytor: Set Model Profile',
      });
      if (!profile) return;

      try {
        await runCommand(
          'Setting model profile...',
          `Setting profile: ${profile}`,
          ['model-profile', 'set', profile],
          outputChannel,
          getTimeouts().history
        );
        vscode.window.showInformationMessage(`Model profile set to ${profile}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to set model profile: ${message}`);
      }
    })
  );

  // ─── History ────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.showHistory', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      outputChannel.show();
      outputChannel.appendLine(`[${new Date().toISOString()}] Loading task history...`);

      try {
        await runCommand(
          'Loading history...',
          'Loading task history',
          ['history'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to load history: ${message}`);
      }
    })
  );

  // ─── Usage ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.showUsage', async () => {
      if (!(await ensureTraytorInstalled(outputChannel))) return;

      outputChannel.show();
      outputChannel.appendLine(`[${new Date().toISOString()}] Loading usage statistics...`);

      try {
        await runCommand(
          'Loading usage...',
          'Loading usage statistics',
          ['usage'],
          outputChannel,
          getTimeouts().history
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to load usage: ${message}`);
      }
    })
  );

  // ─── Task Details Webview ───────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'traytor.showTaskDetails',
      async (taskArg?: { id: string; query: string; status: string; task?: TraytorTask }) => {
        let task: TraytorTask;

        if (taskArg?.task) {
          task = taskArg.task;
        } else if (taskArg?.id) {
          const found = taskProvider.getTask(taskArg.id);
          if (!found) return;
          task = found;
        } else {
          const selected = await pickTask(taskProvider, 'Select a task');
          if (!selected) return;
          const found = taskProvider.getTask(selected.id);
          if (!found) return;
          task = found;
        }

        const panel = vscode.window.createWebviewPanel(
          'traytorTaskDetails',
          `Traytor: ${task.query.substring(0, 40)}...`,
          vscode.ViewColumn.One,
          { enableScripts: true }
        );

        const statusColor =
          task.status === 'completed'
            ? '#4caf50'
            : task.status === 'failed'
              ? '#f44336'
              : task.status === 'in_progress'
                ? '#ff9800'
                : '#9e9e9e';

        const phasesHtml =
          task.phases && task.phases.length > 0
            ? `
          <h3>Phases (${task.phases.length})</h3>
          <div class="phases">
            ${task.phases
              .sort((a, b) => a.order - b.order)
              .map(
                (p) => `
              <div class="phase-item phase-${p.status}">
                <span class="phase-order">${p.order}</span>
                <div class="phase-content">
                  <strong>${p.name}</strong>
                  <p>${p.description}</p>
                </div>
                <span class="phase-status">${p.status.replace('_', ' ')}</span>
              </div>`
              )
              .join('')}
          </div>`
            : '';

        const verificationHtml =
          task.verification && task.verification.comments
            ? `
          <h3>Verification</h3>
          <div class="verification-summary">
            ${task.verification.comments.filter((c) => c.status === 'open').length} open issues
          </div>
          <div class="verification-comments">
            ${task.verification.comments
              .filter((c) => c.status === 'open')
              .map(
                (c) => `
              <div class="comment comment-${c.category}">
                <span class="comment-category">${c.category}</span>
                <p>${c.message}</p>
                ${c.suggestion ? `<p class="suggestion">${c.suggestion}</p>` : ''}
              </div>`
              )
              .join('')}
          </div>`
            : '';

        const planStepsHtml = task.plan
          ? `
          <h3>Plan (${task.plan.steps?.length || 0} steps)</h3>
          <div class="plan-steps">
            ${(task.plan.steps || [])
              .map(
                (s: { title: string; description: string; files?: string[] }, i: number) => `
              <div class="step">
                <span class="step-number">${i + 1}</span>
                <div class="step-content">
                  <strong>${s.title}</strong>
                  <p>${s.description}</p>
                  ${s.files && s.files.length > 0 ? `<p class="files">Files: ${s.files.join(', ')}</p>` : ''}
                </div>
              </div>`
              )
              .join('')}
          </div>`
          : '';

        panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
            h2 { margin-top: 0; display: flex; align-items: center; gap: 8px; }
            h3 { margin-top: 20px; margin-bottom: 8px; color: var(--vscode-descriptionForeground); font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
            .status-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; color: white; background: ${statusColor}; }
            .meta { color: var(--vscode-descriptionForeground); margin-bottom: 16px; font-size: 13px; }
            .meta p { margin: 4px 0; }
            .actions { margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap; }
            .actions button { padding: 6px 14px; cursor: pointer; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; }
            .actions button:hover { opacity: 0.9; }
            .actions button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
            .actions button.danger { background: var(--vscode-errorForeground); color: white; }
            .phases { display: flex; flex-direction: column; gap: 8px; }
            .phase-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 4px; border: 1px solid var(--vscode-panel-border); }
            .phase-completed { border-left: 3px solid #4caf50; }
            .phase-in_progress { border-left: 3px solid #ff9800; }
            .phase-failed { border-left: 3px solid #f44336; }
            .phase-pending { border-left: 3px solid #9e9e9e; }
            .phase-order { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; }
            .phase-content { flex: 1; }
            .phase-content strong { display: block; margin-bottom: 4px; }
            .phase-content p { margin: 0; font-size: 13px; color: var(--vscode-descriptionForeground); }
            .phase-status { font-size: 11px; color: var(--vscode-descriptionForeground); text-transform: capitalize; }
            .verification-summary { padding: 8px; background: var(--vscode-editor-warningBackground); border-radius: 4px; margin-bottom: 8px; }
            .verification-comments { display: flex; flex-direction: column; gap: 8px; }
            .comment { padding: 8px; border-radius: 4px; border: 1px solid var(--vscode-panel-border); }
            .comment-critical { border-left: 3px solid #f44336; }
            .comment-major { border-left: 3px solid #ff9800; }
            .comment-minor { border-left: 3px solid #2196f3; }
            .comment-outdated { border-left: 3px solid #9e9e9e; }
            .comment-category { font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
            .comment p { margin: 4px 0; }
            .suggestion { font-style: italic; color: var(--vscode-descriptionForeground); }
            .plan-steps { display: flex; flex-direction: column; gap: 8px; }
            .step { display: flex; gap: 8px; padding: 8px; border-radius: 4px; border: 1px solid var(--vscode-panel-border); }
            .step-number { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; }
            .step-content { flex: 1; }
            .step-content strong { display: block; margin-bottom: 4px; }
            .step-content p { margin: 0; font-size: 13px; }
            .files { font-size: 12px; color: var(--vscode-textLink-foreground); margin-top: 4px !important; }
            .empty-state { color: var(--vscode-descriptionForeground); font-style: italic; padding: 12px; text-align: center; }
          </style>
        </head>
        <body>
          <h2>${task.query} <span class="status-badge">${task.status.replace('_', ' ')}</span></h2>
          <div class="meta">
            <p><strong>ID:</strong> ${task.id}</p>
            <p><strong>Type:</strong> ${task.type || 'plan'}</p>
            ${task.createdAt ? `<p><strong>Created:</strong> ${new Date(task.createdAt).toLocaleString()}</p>` : ''}
            ${task.updatedAt ? `<p><strong>Updated:</strong> ${new Date(task.updatedAt).toLocaleString()}</p>` : ''}
          </div>
          <div class="actions">
            <button onclick="execute()">▶ Execute</button>
            <button onclick="verify()">✓ Verify</button>
            <button class="secondary" onclick="copyId()">📋 Copy ID</button>
            <button class="danger" onclick="deleteTask()">🗑 Delete</button>
          </div>
          ${planStepsHtml || '<div class="empty-state">No plan generated yet</div>'}
          ${phasesHtml || ''}
          ${verificationHtml || ''}
          <script>
            const vscode = acquireVsCodeApi();
            function execute() { vscode.postMessage({ command: 'execute', taskId: '${task.id}' }); }
            function verify() { vscode.postMessage({ command: 'verify', taskId: '${task.id}' }); }
            function deleteTask() { vscode.postMessage({ command: 'delete', taskId: '${task.id}' }); }
            function copyId() { vscode.postMessage({ command: 'copyId', taskId: '${task.id}' }); }
          </script>
        </body>
        </html>
      `;

        panel.webview.onDidReceiveMessage(async (message: { command: string; taskId: string }) => {
          switch (message.command) {
            case 'execute':
              panel.dispose();
              await vscode.commands.executeCommand('traytor.executeTask', message.taskId);
              break;
            case 'verify':
              panel.dispose();
              await vscode.commands.executeCommand('traytor.verifyTask', message.taskId);
              break;
            case 'delete':
              panel.dispose();
              await vscode.commands.executeCommand('traytor.deleteTask', message.taskId);
              break;
            case 'copyId':
              await vscode.env.clipboard.writeText(message.taskId);
              vscode.window.showInformationMessage(`Copied task ID: ${message.taskId}`);
              break;
          }
        });
      }
    )
  );

  // ─── Delete Task ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.deleteTask', async (taskId?: string) => {
      let targetTaskId = taskId;

      if (!targetTaskId) {
        const task = await pickTask(taskProvider, 'Select a task to delete');
        if (!task) return;
        targetTaskId = task.id;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete task ${targetTaskId}?`,
        { modal: true },
        'Delete'
      );

      if (confirm !== 'Delete') return;

      try {
        await execFileAsync(getTraytorPath(), ['task', 'delete', targetTaskId!], {
          encoding: 'utf-8',
          timeout: 10000,
          cwd: getCwd() ?? undefined,
        });
        vscode.window.showInformationMessage(`Task ${targetTaskId} deleted`);
        taskProvider.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to delete task: ${message}`);
      }
    })
  );

  // ─── Refresh ────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.refreshTasks', () => {
      taskProvider.refresh();
    })
  );

  // ─── Copy Task ID ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.copyTaskId', async (taskArg?: { id: string }) => {
      let taskId: string;

      if (taskArg?.id) {
        taskId = taskArg.id;
      } else {
        const tasks = taskProvider.getAllTasks();
        if (tasks.length === 0) return;
        const items = tasks.map((t) => ({ label: t.query, description: t.id, id: t.id }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a task to copy ID',
        });
        if (!selected) return;
        taskId = selected.id;
      }

      await vscode.env.clipboard.writeText(taskId);
      vscode.window.showInformationMessage(`Copied task ID: ${taskId}`);
    })
  );

  // ─── View Mode Toggle ─────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.toggleViewMode', () => {
      taskProvider.setViewMode('status');
      vscode.window.showInformationMessage('Switched to status grouping');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.viewByType', () => {
      taskProvider.setViewMode('type');
      vscode.window.showInformationMessage('Switched to type grouping');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.viewByStatus', () => {
      taskProvider.setViewMode('status');
      vscode.window.showInformationMessage('Switched to status grouping');
    })
  );

  // ─── Search Tasks ─────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.searchTasks', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search tasks by name, ID, or type',
        placeHolder: 'e.g., auth, task_abc, phases',
        title: 'Traytor: Search Tasks',
      });
      if (query !== undefined) {
        taskProvider.setSearchQuery(query);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('traytor.clearSearch', () => {
      taskProvider.setSearchQuery('');
    })
  );
}
