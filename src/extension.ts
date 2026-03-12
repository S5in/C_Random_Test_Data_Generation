/**
 * C Test Generator Extension
 * 
 *
 * Generates Google Test test cases for C functions with boundary value analysis.
 * Focus: Single function at a time - real developer workflow.
 *
 * v2.0.0: struct/array/pointer support, smarter BVA, preview UI, diagnostics.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FunctionExtractor } from './parser/functionExtractor';
import { GlobalExtractor } from './parser/globalExtractor';
import { GlobalUsageAnalyzer } from './parser/globalUsageAnalyzer';
import { TestGenerator, TestCaseInfo } from './generator/testGenerator';
import { CMakeGenerator } from './generator/cmakeGenerator';
import { BuildRunner } from './build/buildRunner';
import { ExpectedValuesWebview } from './ui/expectedValuesWebview';
import { TestDensity } from './generator/boundaryValues';
import { FunctionParameter } from './types';

let buildRunner: BuildRunner;

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

        buildRunner.log('C Test Generator: Parser initialized successfully');

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
                            'Fill Expected Values',
                            'Build & Run',
                            'View Tests'
                        );

                        if (choice === 'Fill Expected Values') {
                            const shouldBuildAndRun = await ExpectedValuesWebview.show(
                                result.testFilePath, 
                                result.testCases,
                                result.functionName,
                                result.parameters,
                                result.returnType,
                                result.testCode
                            );
                            
                            buildRunner.log(`Webview closed. shouldBuildAndRun: ${shouldBuildAndRun}`);
                            
                            // If user chose "Save & Build & Run", run the tests
                            if (shouldBuildAndRun) {
                                console.log('Starting build and run...');
                                await buildRunner.buildAndRun(result.projectDir, result.executableName);
                            }
                        } else if (choice === 'Build & Run') {
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
                        executableName = sourceFileName.replace('_test.cpp', '_tests');
                    } else if (sourceFileName.endsWith('.c')) {
                        executableName = sourceFileName.replace('.c', '_tests');
                    } else {
                        vscode.window.showWarningMessage('Open a .c or _test.cpp file to build tests');
                        return;
                    }

                    await buildRunner.buildAndRun(projectDir, executableName);
                    
                } catch (error) {
                    buildRunner.log(`Build and run command failed: ${error}`);
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
                    buildRunner.log(`Clean build command failed: ${error}`);
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
    testFilePath: string;
    testCases: TestCaseInfo[];
    testCode: string;
    parameters: FunctionParameter[];
    returnType: string;
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
    
    if (document.languageId !== 'c') {
        vscode.window.showWarningMessage(
            'This command only works with C files (.c extension)'
        );
        return null;
    }

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

    buildRunner.log(`Searching for function at line ${cursorLine}`);

    const code = document.getText();
    const tree = parser.parse(code);

    const targetFunction = FunctionExtractor.findFunctionAtLine(tree, cursorLine);

    if (!targetFunction) {
        vscode.window.showErrorMessage(
            '❌ No function found at cursor position.\n\nPlace your cursor inside a C function body and try again.',
            { modal: false }
        );
        return null;
    }

    buildRunner.log(`Found function: ${targetFunction.name}()`);

    // ========================================
    // STEP 2.5: Warn about high test counts
    // ========================================
    const estimatedTests = GlobalUsageAnalyzer.estimateTestCount(
        targetFunction,
        [] // Estimate without globals first
    );

    // Warning for functions with too many parameters
    if (targetFunction.parameters.length > 7) {
        const choice = await vscode.window.showWarningMessage(
            `⚠️ Function has ${targetFunction.parameters.length} parameters!\n\n` +
            `This will generate approximately ${estimatedTests} tests.\n\n` +
            `💡 Consider refactoring to use a struct instead.\n\n` +
            `Example:\n` +
            `struct Params { int a; int b; int c; };\n` +
            `int myFunc(struct Params params);`,
            { modal: true },
            'Generate Anyway',
            'Cancel'
        );
        
        if (choice !== 'Generate Anyway') {
            return null;
        }
    }

    // Info message for 5-7 params
    if (targetFunction.parameters.length >= 5 && targetFunction.parameters.length <= 7) {
        vscode.window.showInformationMessage(
            `📊 Generating ${estimatedTests} boundary tests (includes overflow detection).`,
            { modal: false }
        );
    }

    vscode.window.showInformationMessage(
        `🎯 Generating tests for: ${targetFunction.name}()`
    );

    // ========================================
    // Step 3: Analyze Global Variables
    // ========================================
    const globals = GlobalExtractor.extractGlobals(tree);
    
    buildRunner.log(`Found ${globals.length} global variable(s)`);

    const usedGlobals = GlobalUsageAnalyzer.analyzeFunction(
        targetFunction,
        globals,
        code
    );

    if (usedGlobals.length > 0) {
        const summary = GlobalUsageAnalyzer.getFunctionGlobalSummary(targetFunction, usedGlobals);
        buildRunner.log(summary);
        
        vscode.window.showInformationMessage(
            `📊 Function uses ${usedGlobals.length} global variable(s): ${usedGlobals.map(g => g.name).join(', ')}`
        );
    }

    // ========================================
    // Step 4: Generate Test Code + Case Info
    // ========================================
    const sourceFileName = path.basename(document.fileName);
    
    // Read test density from configuration
    const density = vscode.workspace.getConfiguration('cTestGenerator').get<TestDensity>('testDensity', 'standard');
    buildRunner.log(`Generating test code (density: ${density})...`);
    
    const { testCode, testCases } = TestGenerator.generateTestsWithCaseInfo(
        targetFunction,
        sourceFileName,
        usedGlobals,
        density
    );

    buildRunner.log(`Generated ${testCases.length} boundary value test case(s)`);
    // ========================================
    // Step 5: Generate CMakeLists.txt
    // ========================================
    const testFileName = `${targetFunction.name}_test.cpp`;
    
    buildRunner.log(`Creating test file: ${testFileName}`);
    
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
        await fs.promises.writeFile(testFilePath, testCode, 'utf8');
        buildRunner.log(`Test file written: ${testFilePath}`);

        await fs.promises.writeFile(cmakeFilePath, cmakeContent, 'utf8');
        buildRunner.log(`CMakeLists.txt written: ${cmakeFilePath}`);

        const testDocument = await vscode.workspace.openTextDocument(testFilePath);
        await vscode.window.showTextDocument(testDocument, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false
        });

        // ========================================
        // Step 7: Use ACTUAL test count (not estimate)
        // ========================================
        const totalTests = testCases.length;

        const executableName = testFileName.replace('_test.cpp', '_tests');

        buildRunner.log(`Generation complete: ${totalTests} test(s) created`);

        return {
            totalTests,
            functionName: targetFunction.name,
            projectDir,
            executableName,
            testFilePath,
            testCases,
            testCode,
            parameters: targetFunction.parameters,
            returnType: targetFunction.returnType
        };

    } catch (error) {
        buildRunner.log(`Failed to write files: ${error}`);
        vscode.window.showErrorMessage(
            `❌ Failed to write test files: ${error}\n\n` +
            `Make sure you have write permissions in: ${projectDir}`
        );
        return null;
    }
}

/**
 * Interactive expected value filling.
 * Prompts developer for each test case's expected output,
 * replaces FAIL() placeholders with EXPECT_EQ().
 * 
 * FIX: Uses test-name-specific regex so that "skip" doesn't
 * cause subsequent answers to shift into wrong test blocks.
 */

/**
 * Extension deactivation
 */
export function deactivate() {
    buildRunner.log('C Test Generator: Deactivating extension...');
    
    if (buildRunner) {
        buildRunner.dispose();
    }
}