import * as vscode from 'vscode';
import * as path from 'path';

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Get the Parser class from the module
        const ParserModule = require('web-tree-sitter');
        const Parser = ParserModule.Parser;
        const Language = ParserModule.Language;
        
        // 1. Initialize the WASM runtime with the correct path
        await Parser.init({
            locateFile(scriptName: string, scriptDirectory: string) {
                return path.join(context.extensionPath, 'dist', scriptName);
            }
        });
        
        // 2. Create the parser instance
        const parser = new Parser();

        // 3. Load the language using VS Code's URI and file system API
        const langPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'tree-sitter-c.wasm');
        console.log('Loading language from URI:', langPath.toString());
        
        const wasmBuffer = await vscode.workspace.fs.readFile(langPath);
        console.log('Read buffer, size:', wasmBuffer.length);
        console.log('Buffer type:', wasmBuffer.constructor.name);
        console.log('First 4 bytes (magic number):', Array.from(wasmBuffer.slice(0, 4)));
        
        // Ensure it's a proper Uint8Array
        const uint8Array = new Uint8Array(wasmBuffer.buffer, wasmBuffer.byteOffset, wasmBuffer.byteLength);
        console.log('Uint8Array first 4 bytes:', Array.from(uint8Array.slice(0, 4)));
        
        const CLang = await Language.load(uint8Array);
        parser.setLanguage(CLang);

        let disposable = vscode.commands.registerCommand('random-test-data-generation.generateTest', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const code = editor.document.getText();
            const tree = parser.parse(code);

            vscode.window.showInformationMessage(`Success! AST Root: ${tree.rootNode.type}`);
        });

        context.subscriptions.push(disposable);
        
        vscode.window.showInformationMessage('Extension activated successfully!');
    } catch (error) {
        console.error('Extension activation failed:', error);
        vscode.window.showErrorMessage(`Failed to activate extension: ${error}`);
    }
}

export function deactivate() {}