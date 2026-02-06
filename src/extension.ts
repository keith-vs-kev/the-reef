import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('The Reef is activating...');

  // TODO: Initialize OpenClaw client
  // TODO: Initialize ReefStateManager
  // TODO: Register SessionTreeProvider
  // TODO: Register CostStatusBar
  // TODO: Register TerminalManager
  // TODO: Register webview providers
  // TODO: Register commands
  // TODO: Start polling

  vscode.window.showInformationMessage('🐙 The Reef is ready');
}

export function deactivate() {
  // TODO: Cleanup polling, terminals, webviews
}
