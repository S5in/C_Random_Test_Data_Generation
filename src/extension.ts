import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FunctionExtractor } from './parser/functionExtractor';
import { TestGenerator } from './generator/testGenerator';

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Get the Parser class from the module
        const ParserModule = require('web-tree-sitter');
        const Parser = ParserModule.Parser;
        const Language = ParserModule.Language;
        
        // 1. Initialize the WASM runtime
        await Parser.init({
            locateFile(scriptName: string, scriptDirectory: string) {
                return path.join(context.extensionPath, 'dist', scriptName);
            }
        });
        
        // 2. Create the parser instance
        const parser = new Parser();

        // 3. Load the C language
        const langPath = path.join(context.extensionPath, 'dist', 'tree-sitter-c.wasm');
        const wasmBuffer = fs.readFileSync(langPath);
        const CLang = await Language.load(wasmBuffer);
        parser.setLanguage(CLang);

        // 4. Register the command
        let disposable = vscode.commands.registerCommand('random-test-data-generation.generateTest', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { 
                vscode.window.showWarningMessage('No active editor found');
                return; 
            }

            const document = editor.document;
            if (document.languageId !== 'c') {
                vscode.window.showWarningMessage('This command only works with C files');
                return;
            }

            const code = document.getText();
            const tree = parser.parse(code);

            // Extract functions
            const functions = FunctionExtractor.extractFunctions(tree);
            
            if (functions.length === 0) {
                vscode.window.showInformationMessage('No functions found in the current file');
                return;
            }

            // Generate test code
            const sourceFileName = path.basename(document.fileName);
            const testCode = TestGenerator.generateTests(functions, sourceFileName);

            // Create new test file
            const testFileName = sourceFileName.replace('.c', '_test.cpp');
            const testFilePath = path.join(path.dirname(document.fileName), testFileName);

            // Write the test file
            await fs.promises.writeFile(testFilePath, testCode, 'utf8');

            // Open the new test file
            const testDocument = await vscode.workspace.openTextDocument(testFilePath);
            await vscode.window.showTextDocument(testDocument);

            vscode.window.showInformationMessage(
                `Generated ${functions.length} test(s) in ${testFileName}`
            );
        });

        context.subscriptions.push(disposable);
    } catch (error) {
        console.error('Extension activation failed:', error);
        vscode.window.showErrorMessage(`Failed to activate extension: ${error}`);
    }
}

export function deactivate() {}