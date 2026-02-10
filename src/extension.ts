// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
import * as path from 'path';
import Parser from 'web-tree-sitter'; 

export async function activate(context: vscode.ExtensionContext) {
    // 1. Initialize the WASM runtime
    await Parser.init(); 
    
    // 2. Create the parser instance
    const parser = new Parser();

    const langPath = path.join(context.extensionPath, 'tree-sitter-c.wasm');
    const CLang = await Parser.Language.load(langPath);
    parser.setLanguage(CLang);

    let disposable = vscode.commands.registerCommand('random-test-data-generation.generateTest', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const code = editor.document.getText();
        const tree = parser.parse(code);

        vscode.window.showInformationMessage(`Success! AST Root: ${tree.rootNode.type}`);
    });

    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
