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
import { StructExtractor } from './parser/structExtractor';
import { TestGenerator, TestCaseInfo } from './generator/testGenerator';
import { CMakeGenerator } from './generator/cmakeGenerator';
import { BuildRunner } from './build/buildRunner';
import { ExpectedValuesWebview } from './ui/expectedValuesWebview';
import { TestDensity, setKnownStructNames, setKnownStructInfos } from './generator/boundaryValues';
import { FunctionParameter, StructInfo } from './types';

let buildRunner: BuildRunner;

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A parsed typedef-struct definition found in C source text.
 */
interface TypedefStructBlock {
    /** The typedef alias name (e.g. "Rectangle") */
    name: string;
    /** The full typedef text as it appears in the source */
    text: string;
}

/**
 * Maximum number of characters to scan from the start of a header file when
 * searching for its include guard (#ifndef GUARD_H).  Top-level include guards
 * always appear within the first few hundred bytes; using a generous limit
 * avoids matching #ifndef directives that appear inside conditional blocks
 * deeper in the file.
 */
const INCLUDE_GUARD_SCAN_BYTES = 2048;

/**
 * Extract typedef-struct definitions from C source text.
 * Returns both the full definition text and the alias name for each match.
 *
 * Only matches non-nested `typedef struct { ... } Name;` patterns to avoid
 * false positives from variable declarations or union/enum typedefs.
 *
 * Limitation: typedef structs whose body contains nested struct/union members
 * (e.g. `typedef struct { struct Inner i; } Outer;`) are NOT matched because
 * the `[^{}]*` body constraint rejects nested braces.  This is intentional —
 * the detection only needs to catch the common flat-struct case, and skipping
 * these structs simply means no guard pre-define is attempted for them.
 */
function extractTypedefStructBlocks(content: string): TypedefStructBlock[] {
    const blocks: TypedefStructBlock[] = [];
    // Match: typedef struct [optional-tag] { simple-body } Name ;
    // [^{}]* in the body prevents matching across nested braces.
    const re = /typedef\s+struct\b[^{}]*\{[^{}]*\}\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        blocks.push({ name: m[1], text: m[0] });
    }
    return blocks;
}

/** Convenience wrapper: return only the alias names from typedef-struct definitions. */
function extractTypedefStructNames(content: string): string[] {
    return extractTypedefStructBlocks(content).map(b => b.name);
}

/**
 * Collected information about headers that conflict with a source file's
 * inline typedef-struct declarations.
 */
interface HeaderConflictInfo {
    /** Include guard macro names to pre-define via -D, skipping the header body */
    guards: string[];
    /** Full content of each conflicting header, used to generate a supplement */
    conflictingHeaders: Array<{ path: string; content: string }>;
}

/**
 * Detect headers whose include guards must be pre-defined (-DGUARD) when
 * compiling sourceFilePath, to prevent "conflicting types" errors caused by
 * a header that defines a struct typedef that the source file also defines
 * inline.  Also returns the header contents so callers can generate a
 * supplement header for non-conflicting types (see generateSupplementHeader).
 *
 * Algorithm:
 *   1. Read the source file and collect its inline typedef-struct names.
 *   2. For each local #include "..." in the source, read the header.
 *   3. If the header defines any of the same typedef names, extract the
 *      header's #ifndef include guard and record it.
 *
 * Limitation: only works for #ifndef/#define include guards, not #pragma once.
 */
function detectHeaderConflicts(sourceFilePath: string): HeaderConflictInfo {
    let sourceContent: string;
    try {
        sourceContent = fs.readFileSync(sourceFilePath, 'utf8');
    } catch {
        return { guards: [], conflictingHeaders: [] };
    }

    const sourceTypedefNames = extractTypedefStructNames(sourceContent);
    if (sourceTypedefNames.length === 0) {
        return { guards: [], conflictingHeaders: [] };
    }

    const sourceDir = path.dirname(sourceFilePath);
    const guards: string[] = [];
    const conflictingHeaders: Array<{ path: string; content: string }> = [];
    const includeRe = /#include\s+"([^"]+)"/g;
    let incMatch: RegExpExecArray | null;

    while ((incMatch = includeRe.exec(sourceContent)) !== null) {
        const headerName = incMatch[1];
        const headerPath = path.join(sourceDir, headerName);
        if (!fs.existsSync(headerPath)) { continue; }

        let headerContent: string;
        try {
            headerContent = fs.readFileSync(headerPath, 'utf8');
        } catch {
            continue;
        }

        const headerTypedefNames = extractTypedefStructNames(headerContent);
        const hasConflict = headerTypedefNames.some(n => sourceTypedefNames.includes(n));
        if (!hasConflict) { continue; }

        // Extract the include guard from near the top of the header file.
        // Top-level include guards always appear within the first
        // INCLUDE_GUARD_SCAN_BYTES bytes; limiting the search avoids matching
        // #ifndef directives inside conditional blocks deeper in the file.
        const headerStart = headerContent.slice(0, INCLUDE_GUARD_SCAN_BYTES);
        const guardMatch = headerStart.match(/#ifndef\s+([A-Za-z0-9_]+)/);
        if (guardMatch) {
            guards.push(guardMatch[1]);
            conflictingHeaders.push({ path: headerPath, content: headerContent });
        }
    }

    return { guards: [...new Set(guards)], conflictingHeaders };
}

/**
 * Generate a supplement header that provides typedef-struct types which are
 * defined in conflicting headers (and thus skipped by the guard pre-define)
 * but are NOT re-declared inline in the source file.
 *
 * Example: structs.h defines both Rectangle and Point.  testStructures.c
 * redefines Rectangle inline (conflict) but uses Point without redefining it.
 * Pre-defining STRUCTS_H skips the whole header — so Point disappears.
 * The supplement header restores Point so the source compiles correctly.
 *
 * @returns { fileName, content } of the supplement header, or null when all
 *          header types are already re-declared in the source (no supplement needed).
 */
function generateSupplementHeader(
    sourceFilePath: string,
    conflictingHeaders: Array<{ path: string; content: string }>
): { fileName: string; content: string } | null {
    let sourceContent: string;
    try {
        sourceContent = fs.readFileSync(sourceFilePath, 'utf8');
    } catch {
        return null;
    }

    const sourceTypedefNames = extractTypedefStructNames(sourceContent);
    const sourceBaseName = path.basename(sourceFilePath, path.extname(sourceFilePath));
    const supplementFileName = `${sourceBaseName}_types_supplement.h`;

    const lines: string[] = [
        `/* Auto-generated type supplement for ${path.basename(sourceFilePath)} */`,
        `/* Provides types from skipped headers that are not re-declared in the source. */`,
        ``
    ];

    let hasContent = false;
    for (const header of conflictingHeaders) {
        for (const block of extractTypedefStructBlocks(header.content)) {
            if (!sourceTypedefNames.includes(block.name)) {
                lines.push(block.text);
                hasContent = true;
            }
        }
    }

    if (!hasContent) { return null; }

    return { fileName: supplementFileName, content: lines.join('\n') + '\n' };
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
                                result.testCode,
                                result.structs
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
    structs: StructInfo[];
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
    // Step 3.5: Extract Struct Definitions
    // Scan the current file AND every .c/.h file in the workspace so that
    // struct types defined in other files (e.g. Rectangle in rectangle.h
    // while editing main.c) are fully known to the boundary-value generator.
    // ========================================
    const currentFileStructs = StructExtractor.extractStructs(tree);
    const allStructs = await collectAllWorkspaceStructs(parser, document.fileName, currentFileStructs);
    setKnownStructNames(allStructs.map(s => s.name));
    setKnownStructInfos(allStructs);
    buildRunner.log(`Found ${allStructs.length} struct definition(s) across workspace (${currentFileStructs.length} in current file)`);
    const structs = allStructs;
    // ========================================

    // ========================================
    // Step 3.6: Collect struct definitions for the target function's parameters.
    // These are emitted inline in the test file's extern "C" block so that the
    // test compiles without needing to #include the entire source file (which
    // can cause typedef-redefinition errors when the source already includes
    // a shared header that defines the same types).
    // ========================================
    const funcStructDefs: StructInfo[] = [];
    for (const param of targetFunction.parameters) {
        const bareName = param.type
            .replace(/^const\s+/, '')
            .replace(/^struct\s+/, '')
            .replace(/\s*[*\[].*/,'')
            .trim()
            .toLowerCase();
        if (!bareName) { continue; }
        const structInfo = allStructs.find(s => s.name.toLowerCase() === bareName);
        if (structInfo && !funcStructDefs.some(s => s.name.toLowerCase() === bareName)) {
            funcStructDefs.push(structInfo);
        }
    }
    buildRunner.log(`Struct defs for ${targetFunction.name}(): ${funcStructDefs.map(s => s.name).join(', ') || 'none'}`);
    // ========================================

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
        density,
        funcStructDefs
    );

    buildRunner.log(`Generated ${testCases.length} boundary value test case(s)`);
    // ========================================
    // Step 5: Generate CMakeLists.txt
    // ========================================
    const testFileName = `${targetFunction.name}_test.cpp`;
    
    buildRunner.log(`Creating test file: ${testFileName}`);

    // Detect headers whose include guards must be pre-defined to prevent
    // duplicate struct typedef errors when compiling the source file.
    const conflictInfo = detectHeaderConflicts(document.fileName);
    const conflictGuards = conflictInfo.guards;
    if (conflictGuards.length > 0) {
        buildRunner.log(`Detected conflicting header guards: ${conflictGuards.join(', ')}`);
    }

    // When a header is skipped (guard pre-defined), any types it defines that
    // are NOT re-declared inline in the source also disappear.  Generate a
    // supplement header to restore those types (e.g. Point from structs.h).
    const supplement = conflictInfo.conflictingHeaders.length > 0
        ? generateSupplementHeader(document.fileName, conflictInfo.conflictingHeaders)
        : null;
    if (supplement) {
        buildRunner.log(`Generated type supplement: ${supplement.fileName}`);
    }
    
    const cmakeContent = CMakeGenerator.generateWithInstructions(
        testFileName,
        sourceFileName,
        conflictGuards,
        supplement?.fileName ?? null
    );

    // ========================================
    // Step 6: Write Files to Disk
    // ========================================
    const projectDir = path.dirname(document.fileName);
    const testFilePath = path.join(projectDir, testFileName);
    const cmakeFilePath = path.join(projectDir, 'CMakeLists.txt');

    try {
        // Write supplement header first (CMakeLists.txt references it)
        if (supplement) {
            const supplementPath = path.join(projectDir, supplement.fileName);
            await fs.promises.writeFile(supplementPath, supplement.content, 'utf8');
            buildRunner.log(`Type supplement written: ${supplementPath}`);
        }

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
            returnType: targetFunction.returnType,
            structs
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
 * Collect struct definitions from all .c and .h files in the workspace,
 * merging with structs already extracted from the current file.
 *
 * Current-file structs take priority and are never overwritten.  Other
 * workspace files are scanned in arbitrary order; the first definition
 * found for a given struct name wins.
 *
 * Files that cannot be read or parsed are silently skipped so that a
 * single bad header never blocks test generation entirely.
 *
 * @param parser          The initialised Tree-sitter parser instance.
 * @param currentFilePath Absolute path of the file being edited (already parsed).
 * @param currentFileStructs Structs already extracted from the current file.
 * @returns Deduplicated list of all known StructInfo objects.
 */
async function collectAllWorkspaceStructs(
    parser: any,
    currentFilePath: string,
    currentFileStructs: StructInfo[]
): Promise<StructInfo[]> {
    // Current-file definitions take priority – register them first.
    const merged = new Map<string, StructInfo>();
    for (const s of currentFileStructs) {
        merged.set(s.name.toLowerCase(), s);
    }

    // Find every C source and header file in the workspace.
    // Exclude common noise directories (node_modules, .git, build, etc.).
    const uris = await vscode.workspace.findFiles(
        '**/*.{c,h}',
        '{**/node_modules/**,**/.git/**,**/build/**,**/dist/**,**/out/**}'
    );

    for (const uri of uris) {
        // Skip the current file – it was already processed above.
        if (uri.fsPath === currentFilePath) { continue; }

        try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf8');
            const fileTree = parser.parse(content);
            const fileStructs = StructExtractor.extractStructs(fileTree);
            for (const s of fileStructs) {
                const key = s.name.toLowerCase();
                if (!merged.has(key)) {
                    merged.set(key, s);
                }
            }
        } catch (err) {
            // A single unreadable/unparseable file should not abort generation.
            buildRunner.log(`collectAllWorkspaceStructs: skipped ${uri.fsPath} (${err})`);
        }
    }

    return Array.from(merged.values());
}

/**
 * Extension deactivation
 */
export function deactivate() {
    buildRunner.log('C Test Generator: Deactivating extension...');
    
    if (buildRunner) {
        buildRunner.dispose();
    }
}