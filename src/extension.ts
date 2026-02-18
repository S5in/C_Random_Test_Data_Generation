import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FunctionExtractor } from './parser/functionExtractor';
import { TestGenerator } from './generator/testGenerator';
import { CMakeGenerator } from './generator/cmakeGenerator';
import { BuildRunner } from './build/buildRunner';
import { generateBoundarySets } from './generator/boundaryValues';

let buildRunner: BuildRunner;

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Initialize build runner
        buildRunner = new BuildRunner();

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

        // 4. Register the "Generate Tests" command
        let generateTestsCommand = vscode.commands.registerCommand(
            'random-test-data-generation.generateTest', 
            async () => {
                const result = await generateTests(parser);
                
                if (result) {
                    // Ask user if they want to build and run immediately
                    const choice = await vscode.window.showInformationMessage(
                        `Generated ${result.totalTests} test case(s) for ${result.functionCount} function(s)`,
                        'Build & Run Tests',
                        'Just Generate'
                    );

                    if (choice === 'Build & Run Tests') {
                        await buildRunner.buildAndRun(result.projectDir, result.executableName);
                    }
                }
            }
        );

        // 5. Register the "Build & Run Tests" command
        let buildAndRunCommand = vscode.commands.registerCommand(
            'random-test-data-generation.buildAndRun',
            async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active editor found');
                    return;
                }

                const projectDir = path.dirname(editor.document.fileName);
                const sourceFileName = path.basename(editor.document.fileName);
                const testFileName = sourceFileName.replace('.c', '_test.cpp');
                const executableName = testFileName.replace('_test.cpp', '_tests');

                await buildRunner.buildAndRun(projectDir, executableName);
            }
        );

        // 6. Register the "Clean Build" command
        let cleanBuildCommand = vscode.commands.registerCommand(
            'random-test-data-generation.cleanBuild',
            async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active editor found');
                    return;
                }

                const projectDir = path.dirname(editor.document.fileName);
                await buildRunner.cleanBuild(projectDir);
                vscode.window.showInformationMessage('Build directory cleaned');
            }
        );

        context.subscriptions.push(generateTestsCommand);
        context.subscriptions.push(buildAndRunCommand);
        context.subscriptions.push(cleanBuildCommand);
        context.subscriptions.push(buildRunner);

    } catch (error) {
        console.error('Extension activation failed:', error);
        vscode.window.showErrorMessage(`Failed to activate extension: ${error}`);
    }
}

/**
 * Generate tests for the active C file
 */
async function generateTests(parser: any): Promise<{
    totalTests: number;
    functionCount: number;
    projectDir: string;
    executableName: string;
} | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return null;
    }

    const document = editor.document;
    if (document.languageId !== 'c') {
        vscode.window.showWarningMessage('This command only works with C files');
        return null;
    }

    const code = document.getText();
    const tree = parser.parse(code);

    // Extract functions
    const functions = FunctionExtractor.extractFunctions(tree);
    
    if (functions.length === 0) {
        vscode.window.showInformationMessage('No functions found in the current file');
        return null;
    }

    // Generate test code
    const sourceFileName = path.basename(document.fileName);
    const testCode = TestGenerator.generateTests(functions, sourceFileName);

    // Generate CMakeLists.txt
    const testFileName = sourceFileName.replace('.c', '_test.cpp');
    const cmakeContent = CMakeGenerator.generateWithInstructions(testFileName, sourceFileName);

    // Create file paths
    const projectDir = path.dirname(document.fileName);
    const testFilePath = path.join(projectDir, testFileName);
    const cmakeFilePath = path.join(projectDir, 'CMakeLists.txt');

    try {
        // Write test file
        await fs.promises.writeFile(testFilePath, testCode, 'utf8');

        // Write CMakeLists.txt (ask if file already exists)
        if (fs.existsSync(cmakeFilePath)) {
            const overwrite = await vscode.window.showWarningMessage(
                'CMakeLists.txt already exists. Overwrite?',
                'Yes', 'No'
            );
            
            if (overwrite === 'Yes') {
                await fs.promises.writeFile(cmakeFilePath, cmakeContent, 'utf8');
            }
        } else {
            await fs.promises.writeFile(cmakeFilePath, cmakeContent, 'utf8');
        }

        // Open the test file
        const testDocument = await vscode.workspace.openTextDocument(testFilePath);
        await vscode.window.showTextDocument(testDocument);

        // Calculate total tests
        const totalTests = functions.reduce((sum, func) => {
            const boundarySets = generateBoundarySets(func.parameters);
            return sum + boundarySets.length;
        }, 0);

        const executableName = testFileName.replace('_test.cpp', '_tests');

        return {
            totalTests,
            functionCount: functions.length,
            projectDir,
            executableName
        };

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to write files: ${error}`);
        return null;
    }
}

export function deactivate() {
    if (buildRunner) {
        buildRunner.dispose();
    }
}