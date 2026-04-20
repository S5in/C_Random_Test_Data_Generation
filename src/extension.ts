/**
 * Voidwalker Extension
 * 
 *
 * Generates Google Test test cases for C functions with boundary value analysis.
 * Focus: Single function at a time - real developer workflow.
 *
 * v2.0.2: add checkPrerequisites command, fix command IDs and WASM loading.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FunctionExtractor } from './parser/functionExtractor';
import { GlobalExtractor } from './parser/globalExtractor';
import { GlobalUsageAnalyzer } from './parser/globalUsageAnalyzer';
import { StructExtractor } from './parser/structExtractor';
import { TestGenerator, TestCaseInfo } from './generator/testGenerator';
import { CMakeGenerator } from './generator/cmakeGenerator';
import { BuildRunner } from './build/buildRunner';
import { ExpectedValuesWebview } from './ui/expectedValuesWebview';
import { setKnownStructNames, setKnownStructInfos } from './generator/boundaryValues';
import { FunctionParameter, StructInfo } from './types';
import { getExtensionConfig } from './config';

let buildRunner: BuildRunner;
let prerequisiteStatusBar: vscode.StatusBarItem;

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
 * Nested struct bodies are intentionally not matched (uncommon in typical
 * C source under test, and the fix only needs approximate detection)
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
 * Standard C headers and the macros/constants they define.
 * Used to detect when a C source file uses a macro without the necessary
 * #include, so the extension can inject it via CMake -include flags.
 */
const SYSTEM_HEADER_MACROS: Array<{ header: string; macros: string[] }> = [
    {
        header: 'limits.h',
        macros: [
            'INT_MIN', 'INT_MAX', 'UINT_MAX',
            'LONG_MIN', 'LONG_MAX', 'ULONG_MAX',
            'LLONG_MIN', 'LLONG_MAX', 'ULLONG_MAX',
            'CHAR_MIN', 'CHAR_MAX', 'SCHAR_MIN', 'SCHAR_MAX', 'UCHAR_MAX',
            'SHRT_MIN', 'SHRT_MAX', 'USHRT_MAX',
            'MB_LEN_MAX', 'CHAR_BIT'
        ]
    },
    {
        header: 'float.h',
        macros: [
            'FLT_MIN', 'FLT_MAX', 'FLT_EPSILON', 'FLT_DIG',
            'DBL_MIN', 'DBL_MAX', 'DBL_EPSILON', 'DBL_DIG',
            'LDBL_MIN', 'LDBL_MAX', 'LDBL_EPSILON'
        ]
    },
    {
        header: 'stdint.h',
        macros: [
            'INT8_MIN', 'INT8_MAX', 'INT16_MIN', 'INT16_MAX',
            'INT32_MIN', 'INT32_MAX', 'INT64_MIN', 'INT64_MAX',
            'UINT8_MAX', 'UINT16_MAX', 'UINT32_MAX', 'UINT64_MAX',
            'INTPTR_MIN', 'INTPTR_MAX', 'UINTPTR_MAX',
            'SIZE_MAX', 'PTRDIFF_MIN', 'PTRDIFF_MAX'
        ]
    },
    {
        header: 'stddef.h',
        macros: ['offsetof']
    }
];
/**
 * Detect standard C headers that are referenced (via their macros/constants)
 * in the source file but are not explicitly #included.
 *
 * Returns a list of header base-names (e.g. ["limits.h"]) that should be
 * force-included via CMake COMPILE_FLAGS "-include limits.h" so that the C
 * source file compiles successfully as a standalone translation unit.
 *
 * Only system headers listed in SYSTEM_HEADER_MACROS are checked.  Headers
 * that are already present as either #include <header.h> or as a transitive
 * include via another header that is already included are not returned (we
 * only check direct #include directives as a heuristic — false negatives are
 * acceptable; false positives cause harmless redundant includes).
 */
function detectMissingSystemIncludes(sourceFilePath: string): string[] {
    let sourceContent: string;
    try {
        sourceContent = fs.readFileSync(sourceFilePath, 'utf8');
    } catch {
        return [];
    }
    // Collect system headers already #included in the source (both <h> and "h").
    // Store only the basename so "#include <limits.h>" and "#include "limits.h""
    // both match the header name "limits.h" used in SYSTEM_HEADER_MACROS.
    const includedHeaders = new Set<string>();
    const includeRe = /#include\s+[<"]([^>"]+)[>"]/g;
    let m: RegExpExecArray | null;
    while ((m = includeRe.exec(sourceContent)) !== null) {
        includedHeaders.add(path.basename(m[1]));
    }
    const missing: string[] = [];
    for (const { header, macros } of SYSTEM_HEADER_MACROS) {
        if (includedHeaders.has(header)) { continue; }
        // Check if any macro from this header appears as a whole-word identifier.
        const usesAny = macros.some(macro => {
            const macroRe = new RegExp(`\\b${escapeRegex(macro)}\\b`);
            return macroRe.test(sourceContent);
        });
        if (usesAny) {
            missing.push(header);
        }
    }
    return missing;
}
/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
    try {
        console.log('Voidwalker: Activating extension...');

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

        let CLang;
        try {
            CLang = await ParserModule.Language.load(langPath);
        } catch (wasmErr) {
            throw new Error(`Failed to load C grammar WASM: ${wasmErr}\n\nEnsure tree-sitter-c.wasm is present in the dist folder.`);
        }
        parser.setLanguage(CLang);

        buildRunner.log('Voidwalker: Parser initialized successfully');

        // ========================================
        // Command 1: Generate Tests for Current Function
        // ========================================
        let generateTestCommand = vscode.commands.registerCommand(
            'voidwalker.generateTest', 
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
            'voidwalker.buildAndRun',
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
                    } else if (sourceFileName.endsWith('.h')) {
                        executableName = sourceFileName.replace('.h', '_tests');
                    } else {
                        vscode.window.showWarningMessage('Open a .c, .h, or _test.cpp file to build tests');
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
            'voidwalker.cleanBuild',
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
        // ========================================
        // Command 4: Check Prerequisites
        // ========================================
        let checkPrerequisitesCommand = vscode.commands.registerCommand(
            'voidwalker.checkPrerequisites',
            async () => {
                await checkPrerequisites(buildRunner, true);
            }
        );
        // ========================================
        // Status bar item for prerequisite status
        // ========================================
        prerequisiteStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        prerequisiteStatusBar.command = 'voidwalker.checkPrerequisites';
        prerequisiteStatusBar.tooltip = 'Voidwalker: Click to check prerequisites (g++, CMake, GTest)';
        prerequisiteStatusBar.text = '$(sync~spin) Prerequisites…';
        prerequisiteStatusBar.show();

        // Register all commands
        context.subscriptions.push(generateTestCommand);
        context.subscriptions.push(buildAndRunCommand);
        context.subscriptions.push(cleanBuildCommand);
        context.subscriptions.push(checkPrerequisitesCommand);
        context.subscriptions.push(prerequisiteStatusBar);
        context.subscriptions.push(buildRunner);

        // Run prerequisite check on activation (non-blocking, warnings only)
        checkPrerequisites(buildRunner, false).catch(() => { /* ignore */ });

        console.log('Voidwalker: Extension activated successfully');

    } catch (error) {
        console.error('Extension activation failed:', error);
        vscode.window.showErrorMessage(
            `Voidwalker failed to activate: ${error}\n\nCheck the output console for details.`
        );
    }
}

/**
 * Check prerequisites (g++, cmake ≥ 3.14, GTest) and report results.
 * @param runner BuildRunner instance for logging
 * @param interactive If true, shows info/error messages to the user; if false, only logs warnings
 */
async function checkPrerequisites(runner: BuildRunner, interactive: boolean): Promise<void> {
    const execFileAsync = promisify(execFile);
    /** Run a command directly, then fall back to a login shell, then (on Windows) to WSL. */
    async function execWithShellFallback(cmd: string, args: string[]): Promise<string> {
        // 1. Try direct execution first (works when the tool is on the extension host PATH).
        try {
            const { stdout } = await execFileAsync(cmd, args);
            return stdout;
        } catch { /* fall through */ }
        const isWindows = process.platform === 'win32';
        // 2. Try via the login shell to pick up the user's PATH.
        // cmd and args are hardcoded caller-controlled strings, not user input.
        try {
            const shell = isWindows ? 'cmd.exe' : '/bin/sh';
            const flag  = isWindows ? '/c'      : '-c';
            const shellCmd = [cmd, ...args].join(' ');
            const { stdout } = await execFileAsync(shell, [flag, shellCmd]);
            return stdout;
        } catch { /* fall through */ }
        // 3. On Windows, try via the default WSL distro.  This covers the common
        //    case where VS Code runs as a native Windows app but the compiler/tools
        //    are installed inside WSL (the extension host is a Win32 process and
        //    cannot see the WSL PATH or filesystem directly).
        if (isWindows) {
            const { stdout } = await execFileAsync('wsl.exe', ['--', cmd, ...args]);
            return stdout;
        }
        throw new Error(`${cmd}: command not found`);
    }
    const results: string[] = [];
    let allOk = true;
    // ── g++ ──────────────────────────────────────────────────────────────────
    try {
        const stdout = await execWithShellFallback('g++', ['--version']);
        const versionLine = stdout.split('\n')[0].trim();
        results.push(`✅ g++: ${versionLine}`);
        runner.log(`Prerequisites: g++ found — ${versionLine}`);
    } catch {
        allOk = false;
        results.push('❌ g++: Not found');
        runner.log('Prerequisites: g++ not found');
    }
    // ── CMake ≥ 3.14 ─────────────────────────────────────────────────────────
    try {
        const stdout = await execWithShellFallback('cmake', ['--version']);
        const match = stdout.match(/cmake version (\d+)\.(\d+)\.?(\d*)/i);
        if (match) {
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            const versionStr = `${major}.${minor}${match[3] ? '.' + match[3] : ''}`;
            if (major > 3 || (major === 3 && minor >= 14)) {
                results.push(`✅ CMake: ${versionStr} (≥ 3.14 required)`);
                runner.log(`Prerequisites: CMake ${versionStr} found`);
            } else {
                allOk = false;
                results.push(`❌ CMake: ${versionStr} — version 3.14 or higher required`);
                runner.log(`Prerequisites: CMake ${versionStr} is too old (need ≥ 3.14)`);
            }
        } else {
            results.push('✅ CMake: found (version unrecognised)');
            runner.log('Prerequisites: CMake found but version not parsed');
        }
    } catch {
        allOk = false;
        results.push('❌ CMake: Not found (3.14+ required)');
        runner.log('Prerequisites: CMake not found');
    }
    function safeFileExists(filePath: string): boolean {
        try { return fs.existsSync(filePath); } catch { return false; }
    }
    // Check GTest: look for libgtest.a in common locations or via pkg-config
    // ── GTest ────────────────────────────────────────────────────────────────
    // Method 1: static path scan (covers common architectures)
    const gtestPaths = [
        '/usr/lib/libgtest.a',
        '/usr/lib/libgtest_main.a',
        '/usr/local/lib/libgtest.a',
        '/usr/local/lib/libgtest_main.a',
        '/usr/lib/x86_64-linux-gnu/libgtest.a',
        '/usr/lib/x86_64-linux-gnu/libgtest_main.a',
        '/usr/lib/aarch64-linux-gnu/libgtest.a',
        '/usr/lib/aarch64-linux-gnu/libgtest_main.a',
        '/usr/lib/arm-linux-gnueabihf/libgtest.a',
        '/usr/lib/arm-linux-gnueabihf/libgtest_main.a',
        '/usr/lib/i386-linux-gnu/libgtest.a',
        '/usr/lib/i386-linux-gnu/libgtest_main.a',
        '/opt/homebrew/lib/libgtest.a',
        '/opt/homebrew/lib/libgtest_main.a',
    ];
    let gtestFound = gtestPaths.some(safeFileExists);
    let gtestFoundBy = gtestFound ? 'static path' : '';
    // Method 1b: on Windows, fs.existsSync cannot reach the WSL virtual filesystem,
    // so use wsl.exe to probe the same paths inside the default WSL distro.
    if (!gtestFound && process.platform === 'win32') {
        try {
            const wslCheck = await execFileAsync('wsl.exe', [
                '--', 'bash', '-c',
                'ls /usr/lib/libgtest.a /usr/local/lib/libgtest.a' +
                ' /usr/lib/x86_64-linux-gnu/libgtest.a' +
                ' /usr/lib/aarch64-linux-gnu/libgtest.a 2>/dev/null | head -1',
            ]);
            if (wslCheck.stdout.trim()) {
                gtestFound = true;
                gtestFoundBy = 'WSL path check';
            }
        } catch { /* WSL not installed or GTest not in WSL */ }
    }
    // Method 2: pkg-config
    if (!gtestFound) {
        try {
            await execWithShellFallback('pkg-config', ['--libs', 'gtest']);
            gtestFound = true;
            gtestFoundBy = 'pkg-config';
        } catch { /* not found via pkg-config */ }
    }
    // Method 3: CMake find_package (most authoritative — same mechanism as the build)
    if (!gtestFound) {
        try {
            const cmakeOut = await execWithShellFallback('cmake', [
                '--find-package',
                '-DNAME=GTest',
                '-DCOMPILER_ID=GNU',
                '-DLANGUAGE=CXX',
                '-DMODE=EXIST',
            ]);
            if (/GTest found/i.test(cmakeOut) || /TRUE/i.test(cmakeOut)) {
                gtestFound = true;
                gtestFoundBy = 'cmake --find-package';
            }
        } catch { /* cmake find-package not available or GTest not found */ }
    }
    // Method 4: package-manager query (Debian/Ubuntu dpkg, macOS brew)
    if (!gtestFound) {
        try {
            const dpkgOut = await execWithShellFallback('dpkg', ['-L', 'libgtest-dev']);
            if (/libgtest/i.test(dpkgOut)) {
                gtestFound = true;
                gtestFoundBy = 'dpkg -L libgtest-dev';
            }
        } catch { /* dpkg not available or package not installed */ }
    }
    if (!gtestFound) {
        try {
            const brewOut = await execWithShellFallback('brew', ['list', 'googletest']);
            if (/googletest/i.test(brewOut)) {
                gtestFound = true;
                gtestFoundBy = 'brew list googletest';
            }
        } catch { /* brew not available or package not installed */ }
    }

    if (gtestFound) {
        results.push(`✅ Google Test (GTest): Found (via ${gtestFoundBy})`);
        runner.log(`Prerequisites: GTest found via ${gtestFoundBy}`);
    } else {
        allOk = false;
        results.push('❌ Google Test (GTest): Not found — libgtest.a missing');
        runner.log('Prerequisites: GTest not found');
    }
    // ── Summary ───────────────────────────────────────────────────────────────
    const summary = results.join('\n');
    runner.log(`Prerequisites check:\n${summary}`);
    const installInstructions = [
        '=== Install Instructions ===',
        'Ubuntu/Debian:',
        '  sudo apt install -y build-essential cmake libgtest-dev',
        '  cd /usr/src/gtest && sudo cmake . && sudo make && sudo cp lib/*.a /usr/lib/',
        'macOS:',
        '  brew install cmake googletest',
    ].join('\n');

    if (!allOk) {
                runner.log(installInstructions);
    }
    // Update status bar
    if (prerequisiteStatusBar) {
        if (allOk) {
            prerequisiteStatusBar.text = '$(check) Prerequisites';
            prerequisiteStatusBar.backgroundColor = undefined;
            prerequisiteStatusBar.tooltip = 'Voidwalker: All prerequisites met. Click to re-check.';
        } else {
            prerequisiteStatusBar.text = '$(warning) Prerequisites';
            prerequisiteStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            prerequisiteStatusBar.tooltip = 'Voidwalker: Some prerequisites are missing. Click to check.';
        }
    }
    if (interactive) {
        if (allOk) {
            vscode.window.showInformationMessage(
                'Voidwalker — All prerequisites met!\n\n' + summary
            );
        } else {
            const choice = await vscode.window.showWarningMessage(
                'Voidwalker — Some prerequisites are missing',
                { modal: true, detail: `${summary}\n\n${installInstructions}` },
                'Open Install Instructions'
            );
            if (choice === 'Open Install Instructions') {
                vscode.env.openExternal(
                    vscode.Uri.parse(
                        'https://github.com/S5in/C_Random_Test_Data_Generation#-prerequisites'
                    )
                );
            }
        }
    } else {
        // Non-interactive: just log warnings for anything missing
        if (!allOk) {
            runner.log('⚠️  Click the "$(warning) Prerequisites" status bar item or run "Voidwalker: Check Prerequisites" from the Command Palette to see details.');
        }
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
    
    // Accept C source and header files only.  VS Code may assign languageId
    // "c" or "cpp" to .h files depending on user configuration and installed
    // extensions, so we also verify the file extension.
    const fileName = path.basename(document.fileName);
    const isCFile = fileName.endsWith('.c');
    const isHFile = fileName.endsWith('.h');
    if ((!isCFile && !isHFile) || (document.languageId !== 'c' && document.languageId !== 'cpp')) {
        vscode.window.showWarningMessage(
            'This command only works with C source or header files (.c or .h)'
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
            '❌ No function found at cursor position.\n\nPlace your cursor on a C function definition or declaration and try again.',
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
    // Step 3.5: Extract Struct Definitions
    const currentFileStructs = StructExtractor.extractStructs(tree);
    const allStructs = await collectAllWorkspaceStructs(parser, document.fileName, currentFileStructs);
    setKnownStructNames(allStructs.map(s => s.name));
    setKnownStructInfos(allStructs);
    buildRunner.log(`Found ${allStructs.length} struct definition(s) across workspace (${currentFileStructs.length} in current file)`);
    const structs = allStructs;
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
    // ========================================
    // Step 4: Generate Test Code + Case Info
    // ========================================
    const sourceFileName = path.basename(document.fileName);
    const isHeaderFile = isHFile;
    
    // Read all extension settings from the centralised config module.
    // This is called on every invocation so that the user's latest changes
    // are always picked up without needing to reload the window.
    const extConfig = getExtensionConfig();
    const { testDensity: density } = extConfig;
    buildRunner.log(`Generating test code (density: ${density}, format: ${extConfig.outputFormat}, randomValues: ${extConfig.numberOfRandomValues})...`);
    
    const { testCode, testCases } = TestGenerator.generateTestsWithCaseInfo(
        targetFunction,
        sourceFileName,
        usedGlobals,
        density,
        funcStructDefs,
        isHeaderFile,
        {
            numberOfRandomValues:   extConfig.numberOfRandomValues,
            outputFormat:           extConfig.outputFormat,
            enableBoundaryNaN:      extConfig.enableBoundaryNaN,
            enableBoundaryInfinity: extConfig.enableBoundaryInfinity,
            enableBoundaryZero:     extConfig.enableBoundaryZero,
            includeNegativeTests:   extConfig.includeNegativeTests,
        }
    );

    buildRunner.log(`Generated ${testCases.length} boundary value test case(s)`);
    // ========================================
    // Step 5: Generate CMakeLists.txt
    // ========================================
    // Apply the testFileNamingPattern setting: {filename} → source file base name.
    const sourceBaseName = path.basename(sourceFileName, path.extname(sourceFileName));
    const testFileName = extConfig.testFileNamingPattern.replace('{filename}', sourceBaseName) + '.cpp';
    
    buildRunner.log(`Creating test file: ${testFileName}`);
    // ── Header-file wrapper ──────────────────────────────────────────────
    // A .h file cannot be compiled as a standalone translation unit.  We
    // generate a thin wrapper .c file that simply #include-s the header.
    // This wrapper is what CMake compiles; the test .cpp file also
    // #include-s the header inside an extern "C" block (see generateHeader
    // in testGenerator.ts).
    //
    // For a corresponding .c file that already exists alongside the header
    // (e.g. math.c next to math.h), the user should open that .c file
    // directly.  The wrapper approach handles the case where only the .h
    // file is available (header-only libraries, or prototypes whose
    // implementation lives elsewhere in the project).
    // ─────────────────────────────────────────────────────────────────────
    let cmakeSourceFileName = sourceFileName;   // .c file that CMake compiles
    let wrapperContent: string | null = null;   // written to disk if non-null
    let wrapperFileName: string | null = null;
    if (isHeaderFile) {
        // Try to find a companion .c file in the same directory first.
        const baseName = path.basename(sourceFileName, '.h');
        const companionCFile = baseName + '.c';
        const companionPath = path.join(path.dirname(document.fileName), companionCFile);
        if (fs.existsSync(companionPath)) {
            // Companion .c file exists — compile it directly (the header is
            // included from the test via extern "C").
            cmakeSourceFileName = companionCFile;
            buildRunner.log(`Found companion source file: ${companionCFile}`);
        } else {
            // No companion — generate a thin wrapper .c file.
            wrapperFileName = `${baseName}_wrapper.c`;
            wrapperContent = [
                `/* Auto-generated wrapper -- includes the header so it can be compiled as a C translation unit. */`,
                `#include "${sourceFileName}"`,
                ``
            ].join('\n');
            cmakeSourceFileName = wrapperFileName;
            buildRunner.log(`Generated wrapper source: ${wrapperFileName}`);
        }
    }
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
        // Detect standard C headers used by the source file but not explicitly
    // #included (e.g. <limits.h> when the file uses INT_MIN).  These are
    // injected via CMake COMPILE_FLAGS so that the C translation unit compiles
    // without requiring the user to modify their source file.
    const missingIncludes = detectMissingSystemIncludes(document.fileName);
    if (missingIncludes.length > 0) {
        buildRunner.log(`Detected missing system includes: ${missingIncludes.join(', ')}`);
    }
    // Combine all force-includes: missing system headers first, then the
    // supplement header (if any).  All become -include flags in COMPILE_FLAGS.
    const forceIncludes: string[] = [
        ...missingIncludes,
        ...(supplement ? [supplement.fileName] : [])
    ];
    // Detect if the source file has a main() function that would conflict
    // with GoogleTest's main entry point provided by GTest::Main.
    const allFunctions = FunctionExtractor.extractFunctions(tree);
    const hasMainFunction = allFunctions.some(f => f.name === 'main');
    if (hasMainFunction) {
        buildRunner.log('Detected main() in source — will rename via -Dmain=__original_main to avoid GTest conflict');
    }
    const cmakeContent = CMakeGenerator.generateWithInstructions(
        testFileName,
        cmakeSourceFileName,
        conflictGuards,
        forceIncludes,
        hasMainFunction
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
        // Write wrapper .c file for header-only sources (if generated)
        if (wrapperFileName && wrapperContent) {
            const wrapperPath = path.join(projectDir, wrapperFileName);
            await fs.promises.writeFile(wrapperPath, wrapperContent, 'utf8');
            buildRunner.log(`Wrapper source written: ${wrapperPath}`);
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

        // Derive executable name using the same logic as CMakeGenerator.getExecutableName():
        // strip .cpp extension then replace trailing _test → _tests (or keep as-is).
        const executableName = path.basename(testFileName, '.cpp').replace(/_test$/, '_tests');

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
 * Extension deactivation
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
export function deactivate() {
    buildRunner.log('Voidwalker: Deactivating extension...');
    
    if (buildRunner) {
        buildRunner.dispose();
    }
}