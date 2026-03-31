import * as vscode from 'vscode';

export class TraytorOutputChannel {
  private channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('Traytor');
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
