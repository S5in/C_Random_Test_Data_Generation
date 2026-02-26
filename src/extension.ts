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
import { TestGenerator, TestCaseInfo } from './generator/testGenerator';
import { CMakeGenerator } from './generator/cmakeGenerator';
import { BuildRunner } from './build/buildRunner';
import { ExpectedValuesWebview } from './ui/expectedValuesWebview';

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
                            'Fill Expected Values',
                            'Build & Run',
                            'View Tests'
                        );

                        if (choice === 'Fill Expected Values') {
                            const shouldBuildAndRun = await ExpectedValuesWebview.show(result.testFilePath, result.testCases);
                            
                            console.log('Webview closed. shouldBuildAndRun:', shouldBuildAndRun);
                            
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
    testFilePath: string;
    testCases: TestCaseInfo[];
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

    console.log(`Searching for function at line ${cursorLine}`);

    const code = document.getText();
    const tree = parser.parse(code);

    const targetFunction = FunctionExtractor.findFunctionAtLine(tree, cursorLine);

    if (!targetFunction) {
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
    
    console.log(`Found ${globals.length} global variable(s)`);

    const usedGlobals = GlobalUsageAnalyzer.analyzeFunction(
        targetFunction,
        globals,
        code
    );

    if (usedGlobals.length > 0) {
        const summary = GlobalUsageAnalyzer.getFunctionGlobalSummary(targetFunction, usedGlobals);
        console.log(summary);
        
        vscode.window.showInformationMessage(
            `📊 Function uses ${usedGlobals.length} global variable(s): ${usedGlobals.map(g => g.name).join(', ')}`
        );
    }

    // ========================================
    // Step 4: Generate Test Code + Case Info
    // ========================================
    const sourceFileName = path.basename(document.fileName);
    
    console.log('Generating test code...');
    
    // FIX: Use generateTestsWithCaseInfo to get both code AND case metadata
    const { testCode, testCases } = TestGenerator.generateTestsWithCaseInfo(
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
        await fs.promises.writeFile(testFilePath, testCode, 'utf8');
        console.log(`Test file written: ${testFilePath}`);

        await fs.promises.writeFile(cmakeFilePath, cmakeContent, 'utf8');
        console.log(`CMakeLists.txt written: ${cmakeFilePath}`);

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

        console.log(`Generation complete: ${totalTests} test(s) created`);

        return {
            totalTests,
            functionName: targetFunction.name,
            projectDir,
            executableName,
            testFilePath,
            testCases
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
 * Interactive expected value filling.
 * Prompts developer for each test case's expected output,
 * replaces FAIL() placeholders with EXPECT_EQ().
 * 
 * FIX: Uses test-name-specific regex so that "skip" doesn't
 * cause subsequent answers to shift into wrong test blocks.
 */
async function fillExpectedValues(testFilePath: string, testCases: TestCaseInfo[]): Promise<void> {
    let fileContent = await fs.promises.readFile(testFilePath, 'utf8');
    let filled = 0;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Fill Expected Values',
            cancellable: true
        },
        async (progress, token) => {
            for (let i = 0; i < testCases.length; i++) {
                if (token.isCancellationRequested) {
                    break;
                }

                const tc = testCases[i];
                progress.report({
                    message: `(${i + 1}/${testCases.length}) ${tc.testName}`,
                    increment: (1 / testCases.length) * 100
                });

                // Build a description of the inputs
                let inputDesc = tc.inputs;
                if (tc.paramValues.length > 0) {
                    inputDesc += ` | Params: ${tc.paramValues.map(p => `${p.name}=${p.value}`).join(', ')}`;
                }
                if (tc.globalValues && tc.globalValues.length > 0) {
                    inputDesc += ` | Globals: ${tc.globalValues.map(g => `${g.name}=${g.value}`).join(', ')}`;
                }

                const expected = await vscode.window.showInputBox({
                    title: `Expected value for ${tc.testName}`,
                    prompt: `What should the function return for these inputs?\n\n${tc.testName}\nInputs: ${inputDesc}\n\nEnter:\n  • The expected return value (e.g., 84, -2, 0.5)\n  • 'skip' to leave as FAIL() (you'll fill manually)\n  • 'overflow' if this case causes overflow (will use SUCCEED())\n  • 'undefined' if behavior is undefined`,
                    placeHolder: `Inputs: ${inputDesc}`,
                    ignoreFocusOut: true,
                    validateInput: (value) => {
                        if (!value || value.trim() === '') {
                            return 'Enter a value, or type "skip" to skip this test';
                        }
                        return null;
                    }
                });

                if (expected === undefined) {
                    // User pressed Escape - stop filling
                    break;
                }

                if (expected.trim().toLowerCase() === 'skip' || expected.trim() === '') {
                    continue;
                }

                // ============================================================
                // FIX: Use a test-name-specific regex!
                //
                // Instead of matching the FIRST generic FAIL() in the file,
                // we find the FAIL() that appears inside the specific TEST
                // block matching this test case's name.
                //
                // The regex finds:
                //   TEST(..., <testName>) {
                //     ... (any content) ...
                //     // TODO: Provide expected value
                //     FAIL() << "Expected value needed. Got: " << result;
                //
                // And replaces only the TODO+FAIL within THAT block.
                // ============================================================
                const escapedTestName = escapeRegex(tc.testName);

                // This regex captures everything from the TEST declaration
                // up to and including the FAIL line, replacing only the
                // TODO comment + FAIL assertion within the correct block.
                const testBlockPattern = new RegExp(
                    `(TEST(?:_F)?\\([^)]*,\\s*${escapedTestName}\\)` +  // Match TEST(..., testName)
                    `[\\s\\S]*?)` +                                       // Capture everything up to...
                    `// TODO: Provide expected value\\s*\\n\\s*` +        // the TODO comment
                    `FAIL\\(\\) << "Expected value needed\\. Got: " << result;`  // and the FAIL line
                );

                const keyword = expected.trim().toLowerCase();
                if (keyword === 'overflow' || keyword === 'undefined') {
                    fileContent = fileContent.replace(
                        testBlockPattern,
                        `$1SUCCEED() << "${expected.trim()} behavior: " << result;`
                    );
                    filled++;
                } else {
                    fileContent = fileContent.replace(
                        testBlockPattern,
                        `$1EXPECT_EQ(result, ${expected.trim()});`
                    );
                    filled++;
                }
            }
        }
    );

    const updatedCount = filled;
    const skippedCount = testCases.length - filled;

    if (updatedCount > 0) {
        await fs.promises.writeFile(testFilePath, fileContent, 'utf8');

        const choice = await vscode.window.showInformationMessage(
            `✅ Updated ${updatedCount} test(s), skipped ${skippedCount}`,
            'Build & Run Now',
            'Just Save'
        );

        // Reload the file in editor
        const testDocument = await vscode.workspace.openTextDocument(testFilePath);
        await vscode.window.showTextDocument(testDocument, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false
        });

        if (choice === 'Build & Run Now') {
            const executableName = path.basename(testFilePath).replace('_test.cpp', '_tests');
            const projectDir = path.dirname(testFilePath);
            await buildRunner.buildAndRun(projectDir, executableName);
        }
    } else {
        vscode.window.showInformationMessage('No expected values provided');
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