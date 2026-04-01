import * as vscode from 'vscode';

export class TraytorOutputChannel {
  private channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('Traytor');
  }

  appendLine(message: string): void {
    const timestamp = new Date()
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z/, '');
    this.channel.appendLine(`[${timestamp}] ${message}`);
  }

  append(message: string): void {
    this.channel.append(message);
  }

  show(): void {
    this.channel.show();
  }

  clear(): void {
    this.channel.clear();
  }

  dispose(): void {
    this.channel.dispose();
  }
}
