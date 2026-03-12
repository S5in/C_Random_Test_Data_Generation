/**
 * Git Runner
 *
 * Handles git add, commit, and push operations for generated test files.
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';

export interface GitResult {
    success: boolean;
    output: string;
    error?: string;
}

export class GitRunner {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Run git add, git commit -m, and git push sequentially.
     *
     * @param cwd           - Working directory (repo root or project dir)
     * @param filePath      - File path to pass to `git add`
     * @param commitMessage - Commit message for `git commit -m`
     */
    async addCommitAndPush(cwd: string, filePath: string, commitMessage: string): Promise<void> {
        this.outputChannel.show(true);
        this.outputChannel.appendLine('\n📦 Starting git operations...\n');

        // git add
        this.outputChannel.appendLine(`> git add "${filePath}"`);
        const addResult = await this.runCommand('git', ['add', filePath], cwd);
        if (addResult.output) { this.outputChannel.appendLine(addResult.output); }
        if (addResult.error)  { this.outputChannel.appendLine(addResult.error); }
        if (!addResult.success) {
            this.outputChannel.appendLine('❌ git add failed\n');
            vscode.window.showErrorMessage(`git add failed: ${addResult.error || addResult.output}`);
            return;
        }
        this.outputChannel.appendLine('✅ git add succeeded\n');

        // git commit -m
        this.outputChannel.appendLine(`> git commit -m "${commitMessage}"`);
        const commitResult = await this.runCommand('git', ['commit', '-m', commitMessage], cwd);
        if (commitResult.output) { this.outputChannel.appendLine(commitResult.output); }
        if (commitResult.error)  { this.outputChannel.appendLine(commitResult.error); }
        if (!commitResult.success) {
            this.outputChannel.appendLine('❌ git commit failed\n');
            vscode.window.showErrorMessage(`git commit failed: ${commitResult.error || commitResult.output}`);
            return;
        }
        this.outputChannel.appendLine('✅ git commit succeeded\n');

        // git push
        this.outputChannel.appendLine('> git push');
        const pushResult = await this.runCommand('git', ['push'], cwd);
        if (pushResult.output) { this.outputChannel.appendLine(pushResult.output); }
        if (pushResult.error)  { this.outputChannel.appendLine(pushResult.error); }
        if (!pushResult.success) {
            this.outputChannel.appendLine('❌ git push failed\n');
            vscode.window.showErrorMessage(`git push failed: ${pushResult.error || pushResult.output}`);
            return;
        }
        this.outputChannel.appendLine('✅ git push succeeded\n');
        this.outputChannel.appendLine('═'.repeat(80));
        this.outputChannel.appendLine('🎉 Git operations completed successfully!');

        vscode.window.showInformationMessage('✅ Changes committed and pushed to git!');
    }

    /**
     * Run a shell command and capture its output.
     */
    private runCommand(command: string, args: string[], cwd: string): Promise<GitResult> {
        return new Promise((resolve) => {
            const proc = spawn(command, args, { cwd, shell: true });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output: stdout,
                    error: stderr || undefined
                });
            });

            proc.on('error', (error) => {
                resolve({
                    success: false,
                    output: stdout,
                    error: error.message
                });
            });
        });
    }
}
