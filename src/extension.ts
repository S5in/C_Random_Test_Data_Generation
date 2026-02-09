// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "random-test-data-generation" is now active!');

    let disposable = vscode.commands.registerCommand('random-test-data-generation.generateTest', () => {
        // This is where the magic will happen!
        vscode.window.showInformationMessage('Random Test Data Generation: Analyzing C function...');
    });

    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
