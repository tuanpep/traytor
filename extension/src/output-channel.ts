import * as vscode from 'vscode';

export class SddOutputChannel {
  private channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('SDD');
  }

  appendLine(message: string): void {
    this.channel.appendLine(message);
  }

  append(message: string): void {
    this.channel.append(message);
  }

  show(): void {
    this.channel.show();
  }

  dispose(): void {
    this.channel.dispose();
  }
}
