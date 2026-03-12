/**
 * Build System Runner
 * 
 *
 * Handles compilation and execution of generated tests.
 * Supports Windows, Linux, and WSL environments.
 *
 * v2.0.0 additions:
 *   - Parses g++/cmake stderr to produce VS Code diagnostics
 *   - Public log() method for extension-wide output channel usage
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import * as os from 'os';

export interface BuildResult {
    success: boolean;
    output: string;
    error?: string;
}

export class BuildRunner {
    private outputChannel: vscode.OutputChannel;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private isWindowsHost: boolean;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('C Test Generator');
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('c-test-generator');
        // Detect if we're running on Windows (not WSL inside)
        this.isWindowsHost = os.platform() === 'win32';
    }

    /**
     * Build and run tests using CMake
     * 
     * @param projectDir - Directory containing CMakeLists.txt
     * @param executableName - Name of the test executable
     */
    async buildAndRun(projectDir: string, executableName: string): Promise<void> {
        this.outputChannel.show(true);
        this.outputChannel.clear();
        this.outputChannel.appendLine('🔨 Starting build process...\n');

        // Detect environment
        const isUnixPath = this.isUnixPath(projectDir);
        
        if (this.isWindowsHost && isUnixPath) {
            // Windows VS Code accessing WSL files
            const wslPath = this.convertToWSLPath(projectDir);
            this.outputChannel.appendLine(`🐧 Detected WSL environment (from Windows)`);
            this.outputChannel.appendLine(`📁 Project directory: ${wslPath || projectDir}\n`);
            await this.buildAndRunWSL(wslPath || projectDir, executableName);
        } else if (!this.isWindowsHost && isUnixPath) {
            // Native Linux
            this.outputChannel.appendLine(`🐧 Detected native Linux environment`);
            this.outputChannel.appendLine(`📁 Project directory: ${projectDir}\n`);
            await this.buildAndRunLinux(projectDir, executableName);
        } else {
            // Native Windows
            this.outputChannel.appendLine(`🪟 Windows environment`);
            this.outputChannel.appendLine(`📁 Project directory: ${projectDir}\n`);
            await this.buildAndRunNative(projectDir, executableName);
        }
    }

    /**
     * Check if a path is a Unix-style path
     */
    private isUnixPath(filePath: string): boolean {
        return filePath.includes('\\wsl$\\') || 
               filePath.includes('\\wsl.localhost\\') ||
               filePath.startsWith('/');
    }

    /**
     * Convert Windows WSL network path to WSL Unix path
     * Example: \\wsl.localhost\Ubuntu-24.04\home\user\... -> /home/user/...
     */
    private convertToWSLPath(windowsPath: string): string | null {
        // Already a Unix path
        if (windowsPath.startsWith('/')) {
            return windowsPath;
        }

        // Pattern: \\wsl.localhost\Ubuntu-24.04\home\... -> /home/...
        const wslLocalhostMatch = windowsPath.match(/\\\\wsl\.localhost\\[^\\]+\\(.+)/);
        if (wslLocalhostMatch) {
            return '/' + wslLocalhostMatch[1].replace(/\\/g, '/');
        }

        // Pattern: \\wsl$\Ubuntu\home\... -> /home/...
        const wslDollarMatch = windowsPath.match(/\\\\wsl\$\\[^\\]+\\(.+)/);
        if (wslDollarMatch) {
            return '/' + wslDollarMatch[1].replace(/\\/g, '/');
        }

        return null;
    }

    /**
     * Build and run in WSL environment (called from Windows)
     */
    private async buildAndRunWSL(projectDir: string, executableName: string): Promise<void> {
        const buildDir = path.posix.join(projectDir, 'build');

        try {
            // Step 1: Create build directory
            this.outputChannel.appendLine('📁 Creating build directory...');
            await this.runWSLCommand(`mkdir -p "${buildDir}"`);

            // Step 2: Configure with CMake
            this.outputChannel.appendLine('⚙️  Configuring with CMake...\n');
            const configureCmd = `cd "${buildDir}" && cmake ..`;
            const configureResult = await this.runWSLCommand(configureCmd);
            
            if (!configureResult.success) {
                this.outputChannel.appendLine('❌ Configuration failed!\n');
                this.outputChannel.appendLine(configureResult.output);
                if (configureResult.error) {
                    this.outputChannel.appendLine('\nError:\n' + configureResult.error);
                }
                
                // Check if CMake is installed
                const cmakeCheck = await this.runWSLCommand('which cmake');
                if (!cmakeCheck.success || !cmakeCheck.output.trim()) {
                    this.outputChannel.appendLine('\n💡 Hint: CMake might not be installed in WSL.');
                    this.outputChannel.appendLine('   Run: sudo apt-get install cmake');
                }
                
                vscode.window.showErrorMessage('CMake configuration failed. See output for details.');
                return;
            }

            this.outputChannel.appendLine(configureResult.output);
            this.outputChannel.appendLine('✅ Configuration successful!\n');

            // Step 3: Build
            this.outputChannel.appendLine('🔨 Building...\n');
            const buildCmd = `cd "${buildDir}" && cmake --build .`;
            const buildResult = await this.runWSLCommand(buildCmd);
            
            if (!buildResult.success) {
                this.outputChannel.appendLine('❌ Build failed!\n');
                this.outputChannel.appendLine(buildResult.output);
                if (buildResult.error) {
                    this.outputChannel.appendLine('\nError:\n' + buildResult.error);
                }
                vscode.window.showErrorMessage('Build failed. See output for details.');
                return;
            }

            this.outputChannel.appendLine(buildResult.output);
            this.outputChannel.appendLine('✅ Build successful!\n');

            // Step 4: Run tests
            this.outputChannel.appendLine('🧪 Running tests...\n');
            this.outputChannel.appendLine('═'.repeat(80));
            
            const runCmd = `cd "${buildDir}" && ./${executableName}`;
            const runResult = await this.runWSLCommand(runCmd);
            
            this.outputChannel.appendLine(runResult.output);
            if (runResult.error) {
                this.outputChannel.appendLine(runResult.error);
            }
            
            this.outputChannel.appendLine('═'.repeat(80));

            if (runResult.success) {
                this.outputChannel.appendLine('\n✅ All tests completed!');
                
                const testSummary = this.parseTestResults(runResult.output);
                vscode.window.showInformationMessage(
                    `✅ Tests passed! ${testSummary.passed}/${testSummary.total} test cases successful`
                );
            } else {
                this.outputChannel.appendLine('\n❌ Some tests failed!');
                const testSummary = this.parseTestResults(runResult.output);
                vscode.window.showWarningMessage(
                    `⚠️ Tests completed with failures: ${testSummary.passed}/${testSummary.total} passed`
                );
            }

        } catch (error) {
            this.outputChannel.appendLine(`\n❌ Error: ${error}`);
            vscode.window.showErrorMessage(`Build failed: ${error}`);
        }
    }

    /**
     * Build and run in native Linux environment
     */
    private async buildAndRunLinux(projectDir: string, executableName: string): Promise<void> {
        const buildDir = path.join(projectDir, 'build');

        try {
            // Step 1: Create build directory
            this.outputChannel.appendLine('📁 Creating build directory...');
            await this.runLinuxCommand(`mkdir -p "${buildDir}"`);

            // Step 2: Configure with CMake
            this.outputChannel.appendLine('⚙️  Configuring with CMake...\n');
            const configureCmd = `cd "${buildDir}" && cmake ..`;
            const configureResult = await this.runLinuxCommand(configureCmd);
            
            if (!configureResult.success) {
                this.outputChannel.appendLine('❌ Configuration failed!\n');
                this.outputChannel.appendLine(configureResult.output);
                if (configureResult.error) {
                    this.outputChannel.appendLine('\nError:\n' + configureResult.error);
                }
                
                // Check if CMake is installed
                const cmakeCheck = await this.runLinuxCommand('which cmake');
                if (!cmakeCheck.success || !cmakeCheck.output.trim()) {
                    this.outputChannel.appendLine('\n💡 Hint: CMake might not be installed.');
                    this.outputChannel.appendLine('   Run: sudo apt-get install cmake');
                }
                
                vscode.window.showErrorMessage('CMake configuration failed. See output for details.');
                return;
            }

            this.outputChannel.appendLine(configureResult.output);
            this.outputChannel.appendLine('✅ Configuration successful!\n');

            // Step 3: Build
            this.outputChannel.appendLine('🔨 Building...\n');
            const buildCmd = `cd "${buildDir}" && cmake --build .`;
            const buildResult = await this.runLinuxCommand(buildCmd);
            
            if (!buildResult.success) {
                this.outputChannel.appendLine('❌ Build failed!\n');
                this.outputChannel.appendLine(buildResult.output);
                if (buildResult.error) {
                    this.outputChannel.appendLine('\nError:\n' + buildResult.error);
                    this.parseBuildDiagnostics(buildResult.error, projectDir);
                }
                vscode.window.showErrorMessage('Build failed. See output for details.');
                return;
            }

            this.outputChannel.appendLine(buildResult.output);
            this.outputChannel.appendLine('✅ Build successful!\n');

            // Step 4: Run tests
            this.outputChannel.appendLine('🧪 Running tests...\n');
            this.outputChannel.appendLine('═'.repeat(80));
            
            const runCmd = `cd "${buildDir}" && ./${executableName}`;
            const runResult = await this.runLinuxCommand(runCmd);
            
            this.outputChannel.appendLine(runResult.output);
            if (runResult.error) {
                this.outputChannel.appendLine(runResult.error);
            }
            
            this.outputChannel.appendLine('═'.repeat(80));

            if (runResult.success) {
                this.outputChannel.appendLine('\n✅ All tests completed!');
                
                const testSummary = this.parseTestResults(runResult.output);
                vscode.window.showInformationMessage(
                    `✅ Tests passed! ${testSummary.passed}/${testSummary.total} test cases successful`
                );
            } else {
                this.outputChannel.appendLine('\n❌ Some tests failed!');
                const testSummary = this.parseTestResults(runResult.output);
                vscode.window.showWarningMessage(
                    `⚠️ Tests completed with failures: ${testSummary.passed}/${testSummary.total} passed`
                );
            }

        } catch (error) {
            this.outputChannel.appendLine(`\n❌ Error: ${error}`);
            vscode.window.showErrorMessage(`Build failed: ${error}`);
        }
    }

    /**
     * Build and run in native Windows environment
     */
    private async buildAndRunNative(projectDir: string, executableName: string): Promise<void> {
        const buildDir = path.join(projectDir, 'build');

        try {
            // Step 1: Create build directory
            this.outputChannel.appendLine('📁 Creating build directory...');
            if (!fs.existsSync(buildDir)) {
                fs.mkdirSync(buildDir, { recursive: true });
            }

            // Step 2: Configure with CMake
            this.outputChannel.appendLine('⚙️  Configuring with CMake...\n');
            const configureResult = await this.runCommand('cmake', ['..'], buildDir);
            
            if (!configureResult.success) {
                this.outputChannel.appendLine('❌ Configuration failed!\n');
                this.outputChannel.appendLine(configureResult.output);
                if (configureResult.error) {
                    this.outputChannel.appendLine('\nError:\n' + configureResult.error);
                }
                vscode.window.showErrorMessage('CMake configuration failed. See output for details.');
                return;
            }

            this.outputChannel.appendLine(configureResult.output);
            this.outputChannel.appendLine('✅ Configuration successful!\n');

            // Step 3: Build
            this.outputChannel.appendLine('🔨 Building...\n');
            const buildResult = await this.runCommand('cmake', ['--build', '.'], buildDir);
            
            if (!buildResult.success) {
                this.outputChannel.appendLine('❌ Build failed!\n');
                this.outputChannel.appendLine(buildResult.output);
                if (buildResult.error) {
                    this.outputChannel.appendLine('\nError:\n' + buildResult.error);
                }
                vscode.window.showErrorMessage('Build failed. See output for details.');
                return;
            }

            this.outputChannel.appendLine(buildResult.output);
            this.outputChannel.appendLine('✅ Build successful!\n');

            // Step 4: Run tests
            this.outputChannel.appendLine('🧪 Running tests...\n');
            this.outputChannel.appendLine('═'.repeat(80));
            
            const testExecutable = path.join(buildDir, executableName + '.exe');
            const runResult = await this.runCommand(testExecutable, [], buildDir);
            
            this.outputChannel.appendLine(runResult.output);
            if (runResult.error) {
                this.outputChannel.appendLine(runResult.error);
            }
            
            this.outputChannel.appendLine('═'.repeat(80));

            if (runResult.success) {
                this.outputChannel.appendLine('\n✅ All tests completed!');
                
                const testSummary = this.parseTestResults(runResult.output);
                vscode.window.showInformationMessage(
                    `✅ Tests passed! ${testSummary.passed}/${testSummary.total} test cases successful`
                );
            } else {
                this.outputChannel.appendLine('\n❌ Some tests failed!');
                const testSummary = this.parseTestResults(runResult.output);
                vscode.window.showWarningMessage(
                    `⚠️ Tests completed with failures: ${testSummary.passed}/${testSummary.total} passed`
                );
            }

        } catch (error) {
            this.outputChannel.appendLine(`\n❌ Error: ${error}`);
            vscode.window.showErrorMessage(`Build failed: ${error}`);
        }
    }

    /**
     * Run a command in WSL (from Windows host)
     */
    private runWSLCommand(command: string): Promise<BuildResult> {
        return new Promise((resolve) => {
            // Use wsl.exe to run commands in WSL from Windows
            const wslCommand = `wsl bash -c "${command.replace(/"/g, '\\"')}"`;
            const process = spawn(wslCommand, [], { shell: true });
            
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output: stdout,
                    error: stderr || undefined
                });
            });

            process.on('error', (error) => {
                resolve({
                    success: false,
                    output: stdout,
                    error: error.message
                });
            });
        });
    }

    /**
     * Run a command in native Linux
     */
    private runLinuxCommand(command: string): Promise<BuildResult> {
        return new Promise((resolve) => {
            // Run directly in bash (no wsl.exe wrapper needed)
            const process = spawn('bash', ['-c', command]);
            
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output: stdout,
                    error: stderr || undefined
                });
            });

            process.on('error', (error) => {
                resolve({
                    success: false,
                    output: stdout,
                    error: error.message
                });
            });
        });
    }

    /**
     * Run a shell command (Windows)
     */
    private runCommand(command: string, args: string[], cwd: string): Promise<BuildResult> {
        return new Promise((resolve) => {
            const process = spawn(command, args, { cwd, shell: true });
            
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output: stdout,
                    error: stderr || undefined
                });
            });

            process.on('error', (error) => {
                resolve({
                    success: false,
                    output: stdout,
                    error: error.message
                });
            });
        });
    }

    /**
     * Parse Google Test output to extract test statistics
     */
    private parseTestResults(output: string): { total: number; passed: number; failed: number } {
        const passedMatch = output.match(/\[\s+PASSED\s+\]\s+(\d+)\s+test/);
        const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;

        const totalMatch = output.match(/Running\s+(\d+)\s+test/);
        const total = totalMatch ? parseInt(totalMatch[1], 10) : passed;

        return {
            total,
            passed,
            failed: total - passed
        };
    }
    /**
     * Parse g++/cmake stderr output into VS Code diagnostics and populate
     * the diagnostic collection so errors appear in the Problems panel.
     *
     * Handles the standard GCC error format:
     *   <file>:<line>:<col>: error: <message>
     *   <file>:<line>:<col>: warning: <message>
     *   <file>:<line>:<col>: note: <message>
     */
    private parseBuildDiagnostics(stderr: string, projectDir: string): void {
        this.diagnosticCollection.clear();
        if (!stderr) { return; }
        // Map file path → list of diagnostics
        const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();
        // GCC error pattern: file:line:col: severity: message
        const errorPattern = /^([^:]+):(\d+):(\d+):\s+(error|warning|note):\s+(.+)$/gm;
        let match: RegExpExecArray | null;
        while ((match = errorPattern.exec(stderr)) !== null) {
            const [, filePart, lineStr, colStr, severity, message] = match;
            const lineNum = Math.max(0, parseInt(lineStr, 10) - 1);
            const colNum  = Math.max(0, parseInt(colStr,  10) - 1);
            // Resolve file path relative to project directory
            const filePath = path.isAbsolute(filePart)
                ? filePart
                : path.join(projectDir, filePart);
            const range = new vscode.Range(lineNum, colNum, lineNum, colNum + 1);
            let diagSeverity: vscode.DiagnosticSeverity;
            if (severity === 'error') {
                diagSeverity = vscode.DiagnosticSeverity.Error;
            } else if (severity === 'warning') {
                diagSeverity = vscode.DiagnosticSeverity.Warning;
            } else {
                diagSeverity = vscode.DiagnosticSeverity.Information;
            }
            const diagnostic = new vscode.Diagnostic(range, message, diagSeverity);
            diagnostic.source = 'C Test Generator';
            if (!diagnosticsMap.has(filePath)) {
                diagnosticsMap.set(filePath, []);
            }
            diagnosticsMap.get(filePath)!.push(diagnostic);
        }
        // Publish to VS Code
        for (const [filePath, diags] of diagnosticsMap) {
            const uri = vscode.Uri.file(filePath);
            this.diagnosticCollection.set(uri, diags);
        }
        if (diagnosticsMap.size > 0) {
            this.outputChannel.appendLine(`\n⚠️  ${diagnosticsMap.size} file(s) with build errors — check the Problems panel.`);
        }
    }
    /**
    /**
     * Clean build directory
     */
    async cleanBuild(projectDir: string): Promise<void> {
        const isUnix = this.isUnixPath(projectDir);
        
        if (this.isWindowsHost && isUnix) {
            // WSL from Windows
            const wslPath = this.convertToWSLPath(projectDir);
            const buildDir = path.posix.join(wslPath || projectDir, 'build');
            this.outputChannel.appendLine('🧹 Cleaning build directory (WSL)...');
            await this.runWSLCommand(`rm -rf "${buildDir}"`);
            this.outputChannel.appendLine('✅ Build directory cleaned!');
        } else if (!this.isWindowsHost && isUnix) {
            // Native Linux
            const buildDir = path.join(projectDir, 'build');
            this.outputChannel.appendLine('🧹 Cleaning build directory (Linux)...');
            await this.runLinuxCommand(`rm -rf "${buildDir}"`);
            this.outputChannel.appendLine('✅ Build directory cleaned!');
        } else {
            // Windows
            const buildDir = path.join(projectDir, 'build');
            if (fs.existsSync(buildDir)) {
                this.outputChannel.appendLine('🧹 Cleaning build directory (Windows)...');
                fs.rmSync(buildDir, { recursive: true, force: true });
                this.outputChannel.appendLine('✅ Build directory cleaned!');
            }
        }
    }

    /**
     * Log a message to the output channel
     */
    log(message: string): void {
        this.outputChannel.appendLine(message);
    }
    /**
    /**
     * Dispose the output channel and diagnostic collection
     */
    dispose(): void {
        this.diagnosticCollection.dispose();
        this.outputChannel.dispose();
    }
}