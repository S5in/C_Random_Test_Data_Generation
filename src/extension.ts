/**
 * C Test Generator Extension
 * 
 * Generates Google Test test cases for C functions with boundary value analysis
 * Focus: Single function at a time - real developer workflow
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FunctionExtractor } from './parser/functionExtractor';
import { GlobalExtractor } from './parser/globalExtractor';
import { GlobalUsageAnalyzer } from './parser/globalUsageAnalyzer';
import { TestGenerator } from './generator/testGenerator';
import { CMakeGenerator } from './generator/cmakeGenerator';
import { BuildRunner } from './build/buildRunner';

let buildRunner: BuildRunner;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
    try {
        console.log('C Test Generator: Activating extension...');

        // Initialize build runner
        buildRunner = new BuildRunner();

        // Initialize Tree-sitter parser for C
        const ParserModule = require('web-tree-sitter');
        const Parser = ParserModule.Parser;
        
        await Parser.init({
            locateFile(scriptName: string, scriptDirectory: string) {
                return path.join(context.extensionPath, 'dist', scriptName);
            }
        });
        
        const parser = new Parser();

        // Load C language grammar
        const langPath = path.join(context.extensionPath, 'dist', 'tree-sitter-c.wasm');
        
        if (!fs.existsSync(langPath)) {
            throw new Error(`C grammar not found at: ${langPath}`);
        }

        const wasmBuffer = fs.readFileSync(langPath);
        const CLang = await ParserModule.Language.load(wasmBuffer);
        parser.setLanguage(CLang);

        console.log('C Test Generator: Parser initialized successfully');

        // ========================================
        // Command 1: Generate Tests for Current Function
        // ========================================
        let generateTestCommand = vscode.commands.registerCommand(
            'random-test-data-generation.generateTest', 
            async () => {
                try {
                    const result = await generateTestForCurrentFunction(parser);
                    
                    if (result) {
                        // Show success message with options
                        const choice = await vscode.window.showInformationMessage(
                            `✅ Generated ${result.totalTests} test case(s) for ${result.functionName}()`,
                            'View Tests',
                            'Build & Run'
                        );

                        if (choice === 'Build & Run') {
                            await buildRunner.buildAndRun(result.projectDir, result.executableName);
                        }
                    }
                } catch (error) {
                    console.error('Generate test command failed:', error);
                    vscode.window.showErrorMessage(`Failed to generate tests: ${error}`);
                }
            }
        );

        // ========================================
        // Command 2: Build & Run Tests
        // ========================================
        let buildAndRunCommand = vscode.commands.registerCommand(
            'random-test-data-generation.buildAndRun',
            async () => {
                try {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showWarningMessage('No active editor found');
                        return;
                    }

                    const document = editor.document;
                    const projectDir = path.dirname(document.fileName);
                    
                    // Determine executable name from file
                    const sourceFileName = path.basename(document.fileName);
                    
                    // Check if this is a test file or source file
                    let executableName: string;
                    
                    if (sourceFileName.endsWith('_test.cpp')) {
                        // User is in test file: test_math_test.cpp -> test_math_tests
                        executableName = sourceFileName.replace('_test.cpp', '_tests');
                    } else if (sourceFileName.endsWith('.c')) {
                        // User is in source file: test_math.c -> test_math_tests
                        executableName = sourceFileName.replace('.c', '_tests');
                    } else {
                        vscode.window.showWarningMessage('Open a .c or _test.cpp file to build tests');
                        return;
                    }

                    await buildRunner.buildAndRun(projectDir, executableName);
                    
                } catch (error) {
                    console.error('Build and run command failed:', error);
                    vscode.window.showErrorMessage(`Build failed: ${error}`);
                }
            }
        );

        // ========================================
        // Command 3: Clean Build Directory
        // ========================================
        let cleanBuildCommand = vscode.commands.registerCommand(
            'random-test-data-generation.cleanBuild',
            async () => {
                try {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showWarningMessage('No active editor found');
                        return;
                    }

                    const projectDir = path.dirname(editor.document.fileName);
                    await buildRunner.cleanBuild(projectDir);
                    
                    vscode.window.showInformationMessage('✅ Build directory cleaned');
                    
                } catch (error) {
                    console.error('Clean build command failed:', error);
                    vscode.window.showErrorMessage(`Failed to clean build: ${error}`);
                }
            }
        );

        // Register all commands
        context.subscriptions.push(generateTestCommand);
        context.subscriptions.push(buildAndRunCommand);
        context.subscriptions.push(cleanBuildCommand);
        context.subscriptions.push(buildRunner);

        console.log('C Test Generator: Extension activated successfully');

    } catch (error) {
        console.error('Extension activation failed:', error);
        vscode.window.showErrorMessage(
            `C Test Generator failed to activate: ${error}\n\nCheck the output console for details.`
        );
    }
}

/**
 * Generate tests for the function at the current cursor position
 */
async function generateTestForCurrentFunction(parser: any): Promise<{
    totalTests: number;
    functionName: string;
    projectDir: string;
    executableName: string;
} | null> {
    
    // ========================================
    // Step 1: Validate Editor and Document
    // ========================================
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return null;
    }

    const document = editor.document;
    
    // Check language
    if (document.languageId !== 'c') {
        vscode.window.showWarningMessage(
            'This command only works with C files (.c extension)'
        );
        return null;
    }

    // Check if file is saved
    if (document.isDirty) {
        const save = await vscode.window.showWarningMessage(
            'File has unsaved changes. Save before generating tests?',
            'Save and Continue',
            'Cancel'
        );
        
        if (save === 'Save and Continue') {
            await document.save();
        } else {
            return null;
        }
    }

    // ========================================
    // Step 2: Find Function at Cursor
    // ========================================
    const cursorPosition = editor.selection.active;
    const cursorLine = cursorPosition.line;

    console.log(`Searching for function at line ${cursorLine}`);

    // Parse the entire file
    const code = document.getText();
    const tree = parser.parse(code);

    // Find function at cursor position
    const targetFunction = FunctionExtractor.findFunctionAtLine(tree, cursorLine);

    if (!targetFunction) {
        // Show helpful error with instructions
        vscode.window.showWarningMessage(
            '❌ No function found at cursor position.\n\n' +
            'Place your cursor inside a function and try again.\n\n' +
            'Example:\n' +
            'int add(int x, int y) {\n' +
            '    return x + y;  ← cursor here\n' +
            '}',
            { modal: false }
        );
        return null;
    }

    console.log(`Found function: ${targetFunction.name}()`);

    // Show which function we're generating for
    vscode.window.showInformationMessage(
        `🎯 Generating tests for: ${targetFunction.name}()`
    );

    // ========================================
    // Step 3: Analyze Global Variables
    // ========================================
    const globals = GlobalExtractor.extractGlobals(tree);
    
    console.log(`Found ${globals.length} global variable(s)`);

    // Analyze which globals THIS function uses
    const usedGlobals = GlobalUsageAnalyzer.analyzeFunction(
        targetFunction,
        globals,
        code
    );

    // Log summary if globals are used
    if (usedGlobals.length > 0) {
        const summary = GlobalUsageAnalyzer.getFunctionGlobalSummary(targetFunction, usedGlobals);
        console.log(summary);
        
        vscode.window.showInformationMessage(
            `📊 Function uses ${usedGlobals.length} global variable(s): ${usedGlobals.map(g => g.name).join(', ')}`
        );
    }

    // ========================================
    // Step 4: Generate Test Code
    // ========================================
    const sourceFileName = path.basename(document.fileName);
    
    console.log('Generating test code...');
    
    const testCode = TestGenerator.generateTestsForFunction(
        targetFunction,
        sourceFileName,
        usedGlobals
    );

    // ========================================
    // Step 5: Generate CMakeLists.txt
    // ========================================
    const testFileName = `${targetFunction.name}_test.cpp`;
    
    console.log(`Creating test file: ${testFileName}`);
    
    const cmakeContent = CMakeGenerator.generateWithInstructions(
        testFileName,
        sourceFileName
    );

    // ========================================
    // Step 6: Write Files to Disk
    // ========================================
    const projectDir = path.dirname(document.fileName);
    const testFilePath = path.join(projectDir, testFileName);
    const cmakeFilePath = path.join(projectDir, 'CMakeLists.txt');

    try {
        // Write test file
        await fs.promises.writeFile(testFilePath, testCode, 'utf8');
        console.log(`Test file written: ${testFilePath}`);

        // Write CMakeLists.txt (always overwrite - it's auto-generated)
        await fs.promises.writeFile(cmakeFilePath, cmakeContent, 'utf8');
        console.log(`CMakeLists.txt written: ${cmakeFilePath}`);

        // ========================================
        // Step 7: Open Test File in Editor
        // ========================================
        const testDocument = await vscode.workspace.openTextDocument(testFilePath);
        await vscode.window.showTextDocument(testDocument, {
            viewColumn: vscode.ViewColumn.Beside,  // Open side-by-side
            preview: false
        });

        // ========================================
        // Step 8: Calculate and Return Statistics
        // ========================================
        const totalTests = GlobalUsageAnalyzer.estimateTestCount(
            targetFunction,
            usedGlobals
        );

        const executableName = testFileName.replace('_test.cpp', '_tests');

        console.log(`Generation complete: ${totalTests} test(s) created`);

        return {
            totalTests,
            functionName: targetFunction.name,
            projectDir,
            executableName
        };

    } catch (error) {
        console.error('Failed to write files:', error);
        vscode.window.showErrorMessage(
            `❌ Failed to write test files: ${error}\n\n` +
            `Make sure you have write permissions in: ${projectDir}`
        );
        return null;
    }
}

/**
 * Extension deactivation
 */
export function deactivate() {
    console.log('C Test Generator: Deactivating extension...');
    
    if (buildRunner) {
        buildRunner.dispose();
    }
    
    console.log('C Test Generator: Extension deactivated');
}