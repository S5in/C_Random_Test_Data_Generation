/**
 * Webview for filling expected test values
 * Provides a rich UI for entering expected values for generated tests
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { TestCaseInfo } from '../generator/testGenerator';

export class ExpectedValuesWebview {
    /**
     * Show webview panel for filling expected values
     */
    /**
 /**
 * Show webview panel for filling expected values
 * @returns Promise that resolves to true if user wants to build & run, false otherwise
 */
static async show(testFilePath: string, testCases: TestCaseInfo[]): Promise<boolean> {
    return new Promise((resolve) => {
        const panel = vscode.window.createWebviewPanel(
            'fillExpectedValues',
            '✨ Fill Expected Values',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getHtmlContent(testCases);

        // Track if we already resolved
        let resolved = false;

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(
            async message => {
                if (resolved) return;

                switch (message.command) {
                    case 'save':
                        await this.saveExpectedValues(testFilePath, message.values);
                        resolved = true;
                        panel.dispose();
                        vscode.window.showInformationMessage('✅ Expected values saved! Building and running tests...');
                        resolve(true); // User wants to build & run
                        return;
                    case 'saveOnly':
                        await this.saveExpectedValues(testFilePath, message.values);
                        resolved = true;
                        panel.dispose();
                        vscode.window.showInformationMessage('✅ Expected values saved!');
                        resolve(false); // Don't build & run
                        return;
                    case 'skip':
                        resolved = true;
                        panel.dispose();
                        resolve(false); // Don't build & run
                        return;
                }
            }
        );

        // Handle panel disposal
        panel.onDidDispose(() => {
            if (!resolved) {
                resolved = true;
                resolve(false);
            }
        });
    });
}

    /**
     * Generate HTML content for the webview
     */
    private static getHtmlContent(testCases: TestCaseInfo[]): string {
        const testCaseHtml = testCases.map((tc, index) => `
            <div class="test-case">
                <div class="test-header">
                    <span class="test-icon">🧪</span>
                    <span class="test-name">${this.escapeHtml(tc.testName)}</span>
                </div>
                <div class="test-inputs">
                    <span class="label">Inputs:</span>
                    <code>${this.escapeHtml(tc.inputs || 'No parameters')}</code>
                </div>
                ${tc.globalValues && tc.globalValues.length > 0 ? `
                <div class="test-globals">
                    <span class="label">Globals:</span>
                    <code>${tc.globalValues.map(g => `${g.name}=${g.value}`).join(', ')}</code>
                </div>
                ` : ''}
                <div class="input-group">
                    <label for="expected-${index}">Expected result:</label>
                    <input 
                        type="text" 
                        id="expected-${index}" 
                        class="expected-input"
                        placeholder="e.g., 42, -100, 0.5, 'overflow', 'undefined', or 'skip'"
                        data-test-index="${index}"
                    />
                </div>
            </div>
        `).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fill Expected Values</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            line-height: 1.6;
        }

        .header {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--vscode-textSeparator-foreground);
        }

        .header h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }

        .header p {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .test-case {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-left: 4px solid var(--vscode-textLink-activeForeground);
            padding: 20px;
            margin: 20px 0;
            border-radius: 6px;
            transition: all 0.2s ease;
        }

        .test-case:hover {
            border-left-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .test-header {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
        }

        .test-icon {
            font-size: 20px;
            margin-right: 10px;
        }

        .test-name {
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
            font-family: var(--vscode-editor-font-family);
        }

        .test-inputs,
        .test-globals {
            margin: 10px 0;
            font-size: 13px;
        }

        .label {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
            margin-right: 8px;
        }

        code {
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textPreformat-foreground);
            padding: 4px 8px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        .input-group {
            margin-top: 15px;
        }

        .input-group label {
            display: block;
            margin-bottom: 6px;
            color: var(--vscode-foreground);
            font-weight: 500;
            font-size: 13px;
        }

        input.expected-input {
            width: 100%;
            padding: 10px 12px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 14px;
            font-family: var(--vscode-editor-font-family);
            transition: all 0.2s ease;
        }

        input.expected-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        input.expected-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .button-group {
            display: flex;
            gap: 12px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-textSeparator-foreground);
        }

        .btn {
            padding: 10px 24px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .btn:active {
            transform: scale(0.98);
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .stats {
            display: flex;
            gap: 20px;
            margin-top: 10px;
            padding: 15px;
            background: var(--vscode-textCodeBlock-background);
            border-radius: 4px;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .stat-label {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }

        .stat-value {
            color: var(--vscode-textLink-foreground);
            font-weight: 600;
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>✨ Fill Expected Values</h1>
        <p>Review the test cases below and provide expected output values.</p>
        <p style="margin-top: 8px; font-size: 13px;">
            💡 <strong>Tip:</strong> Enter numbers (e.g., <code>42</code>, <code>-100</code>), 
            or special keywords: <code>overflow</code>, <code>undefined</code>, <code>skip</code>
        </p>
        <div class="stats">
            <div class="stat-item">
                <span class="stat-label">Total test cases:</span>
                <span class="stat-value">${testCases.length}</span>
            </div>
        </div>
    </div>

    <div class="test-cases">
        ${testCaseHtml}
    </div>

   <div class="button-group">
        <button class="btn btn-primary" onclick="saveAndRun()">
            <span>🚀</span>
            <span>Save & Build & Run</span>
        </button>
        <button class="btn btn-secondary" onclick="saveOnly()">
            <span>💾</span>
            <span>Save Only</span>
        </button>
        <button class="btn btn-secondary" onclick="skip()">
            <span>⏭️</span>
            <span>Skip</span>
        </button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function collectValues() {
            const inputs = document.querySelectorAll('.expected-input');
            const values = [];
            
            inputs.forEach((input, index) => {
                const value = input.value.trim();
                if (value) {
                    values.push({
                        index: index,
                        value: value
                    });
                }
            });

            return values;
        }

        function saveAndRun() {
            const values = collectValues();
            vscode.postMessage({
                command: 'save',
                values: values
            });
        }

        function saveOnly() {
            const values = collectValues();
            vscode.postMessage({
                command: 'saveOnly',
                values: values
            });
        }

        function skip() {
            vscode.postMessage({
                command: 'skip'
            });
        }

        // Focus first input on load
        window.addEventListener('load', () => {
            const firstInput = document.querySelector('.expected-input');
            if (firstInput) {
                firstInput.focus();
            }
        });

        // Allow Enter key to move to next input
        document.querySelectorAll('.expected-input').forEach((input, index, inputs) => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    } else {
                        saveAndRun();
                    }
                }
            });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Save expected values to test file
     */
    /**
 * Save expected values to test file
 */
private static async saveExpectedValues(
    testFilePath: string,
    values: Array<{ index: number; value: string }>
): Promise<void> {
    if (values.length === 0) {
        return;
    }

    try {
        let content = await fs.promises.readFile(testFilePath, 'utf8');

        // Replace FAIL() lines with EXPECT_EQ or special handling
        const lines = content.split('\n');
        let testIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Detect start of new test
            if (line.includes('TEST(') || line.includes('TEST_F(')) {
                testIndex++;
            }

            // Find TODO comment line followed by FAIL()
            if (line.includes('// TODO: Provide expected value')) {
                const valueEntry = values.find(v => v.index === testIndex);
                if (valueEntry && i + 1 < lines.length && lines[i + 1].includes('FAIL()')) {
                    const indent = lines[i + 1].match(/^\s*/)?.[0] || '    ';
                    const trimmedValue = valueEntry.value.trim().toLowerCase();

                    // Handle special keywords
                    if (trimmedValue === 'overflow') {
                        lines[i] = `${indent}// Expected: Overflow behavior`;
                        lines[i + 1] = `${indent}SUCCEED() << "Overflow case - result: " << result;`;
                    } else if (trimmedValue === 'undefined' || trimmedValue === 'ub') {
                        lines[i] = `${indent}// Expected: Undefined behavior`;
                        lines[i + 1] = `${indent}SUCCEED() << "Undefined behavior case - result: " << result;`;
                    } else if (trimmedValue === 'skip' || trimmedValue === '') {
                        // Keep FAIL() as is
                        continue;
                    } else {
                        // Normal expected value - remove TODO, replace FAIL with EXPECT_EQ
                        lines[i] = `${indent}EXPECT_EQ(result, ${valueEntry.value});`;
                        lines.splice(i + 1, 1); // Remove the FAIL() line
                    }
                }
            }
        }

        await fs.promises.writeFile(testFilePath, lines.join('\n'), 'utf8');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save expected values: ${error}`);
        throw error;
    }
}

    /**
     * Escape HTML special characters
     */
    private static escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}