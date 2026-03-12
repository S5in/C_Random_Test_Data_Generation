/**
 * Webview for filling expected test values
 * Provides a rich UI for entering expected values for generated tests
 * NOW WITH CUSTOM TESTS SUPPORT!
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { TestCaseInfo } from '../generator/testGenerator';

interface CustomTest {
    name: string;
    params: { [key: string]: string };
    expected: string;
}

export class ExpectedValuesWebview {
    /**
     * Show webview panel for filling expected values
     * @returns Promise that resolves to true if user wants to build & run, false otherwise
     */
    static async show(
        testFilePath: string, 
        testCases: TestCaseInfo[],
        functionName: string,
        paramNames: string[],
        testCode?: string
    ): Promise<boolean> {
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

             panel.webview.html = this.getHtmlContent(testCases, functionName, paramNames, testCode || '');

            let resolved = false;

            panel.webview.onDidReceiveMessage(
                async message => {
                    if (resolved) { return; }

                    switch (message.command) {
                        case 'save': {
                            await this.saveExpectedValues(testFilePath, message.values, message.disabledTests || []);
                            await this.saveCustomTests(testFilePath, functionName, paramNames, message.customTests || []);
                            resolved = true;
                            panel.dispose();
                            const totalTests = message.values.length + (message.customTests?.length || 0);
                            vscode.window.showInformationMessage(`✅ Saved ${totalTests} test(s)! Building and running...`);
                            resolve(true);
                            return;
                        }
                        case 'saveOnly': {
                            await this.saveExpectedValues(testFilePath, message.values, message.disabledTests || []);
                            await this.saveCustomTests(testFilePath, functionName, paramNames, message.customTests || []);
                            resolved = true;
                            panel.dispose();
                            const total = message.values.length + (message.customTests?.length || 0);
                            vscode.window.showInformationMessage(`✅ Saved ${total} test(s)!`);
                            resolve(false);
                            return;
                        }
                        case 'skip':
                            resolved = true;
                            panel.dispose();
                            resolve(false);
                            return;
                    }
                }
            );

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
    private static getHtmlContent(
        testCases: TestCaseInfo[], 
        functionName: string,
        paramNames: string[],
        testCode: string
    ): string {
        const testCaseHtml = testCases.map((tc, index) => `
            <div class="test-case" id="test-case-${index}">
                <div class="test-header">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            id="enabled-${index}"
                            class="test-enabled-checkbox"
                            data-test-index="${index}"
                            checked
                            onchange="updateSelectedCount()"
                        />
                        <span class="test-icon">🧪</span>
                        <span class="test-name">${this.escapeHtml(tc.testName)}</span>
                    </label>
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

        const paramInputs = paramNames.map(p => 
            `<input type="text" class="custom-param-input" data-param="${p}" placeholder="${p}" />`
        ).join('\n                ');
                // Syntax-highlighted preview of the generated code
        const escapedCode = this.escapeHtml(testCode);
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
        }

        .header p {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 2px solid var(--vscode-textSeparator-foreground);
        }

        .tab {
            padding: 10px 20px;
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            border-bottom: 3px solid transparent;
            transition: all 0.2s;
        }

        .tab:hover {
            color: var(--vscode-foreground);
        }

        .tab.active {
            color: var(--vscode-textLink-foreground);
            border-bottom-color: var(--vscode-textLink-foreground);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
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

        input.expected-input,
        input.custom-param-input,
        input.custom-name-input,
        input.custom-expected-input {
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

        input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .custom-test-row {
            display: grid;
            grid-template-columns: 150px ${paramNames.map(() => '1fr').join(' ')} 1fr 40px;
            gap: 10px;
            margin: 15px 0;
            align-items: center;
            padding: 15px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
        }

        .custom-test-header {
            display: grid;
            grid-template-columns: 150px ${paramNames.map(() => '1fr').join(' ')} 1fr 40px;
            gap: 10px;
            margin: 15px 0;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
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

        .btn-small {
            padding: 5px 10px;
            font-size: 12px;
        }

        .remove-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            padding: 8px;
            cursor: pointer;
            font-size: 16px;
        }

        .remove-btn:hover {
            background: var(--vscode-errorForeground);
            color: white;
        }

        .empty-custom-tests {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .add-custom-btn {
            margin: 20px 0;
        }
                /* Preview tab styles */
        .preview-container {
            position: relative;
        }
        .code-preview {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 13px;
            line-height: 1.5;
            white-space: pre;
            color: var(--vscode-editor-foreground);
            max-height: 70vh;
            overflow-y: auto;
        }
        /* Syntax highlighting */
        .kw  { color: #569cd6; }  /* keywords: TEST, EXPECT_EQ, etc. */
        .inc { color: #c586c0; }  /* #include */
        .str { color: #ce9178; }  /* strings */
        .cmt { color: #6a9955; }  /* comments */
        .num { color: #b5cea8; }  /* numbers */
        .typ { color: #4ec9b0; }  /* types */
        .checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }
        .test-enabled-checkbox {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
        .test-case.disabled {
            opacity: 0.45;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>✨ Fill Expected Values</h1>
        <p>Review boundary tests and add custom test cases with your own input values</p>
        <div class="stats">
            <div class="stat-item">
                <span class="stat-label">Tests generated:</span>
                <span class="stat-value">${testCases.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Selected:</span>
                <span class="stat-value" id="selected-count">${testCases.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Custom:</span>
                <span class="stat-value" id="custom-count">0</span>
            </div>
        </div>
    </div>

    <div class="tabs">
        <button class="tab active" onclick="switchTab(event, 'boundary')">
            🧪 Boundary Tests (${testCases.length})
        </button>
        <button class="tab" onclick="switchTab(event, 'custom')">
            ➕ Custom Tests (<span id="custom-tab-count">0</span>)
        </button>
        <button class="tab" onclick="switchTab(event, 'preview')">
            👁️ Preview
        </button>
    </div>

    <!-- Tab 1: Boundary Tests -->
    <div id="boundary-tab" class="tab-content active">
        <p style="color: var(--vscode-descriptionForeground); margin-bottom: 15px;">
            💡 <strong>Tip:</strong> Enter numbers (e.g., <code>42</code>, <code>-100</code>), 
            or special keywords: <code>overflow</code>, <code>undefined</code>, <code>skip</code>.
            Uncheck a test to exclude it from the saved file.
        </p>
        <div class="test-cases">
            ${testCaseHtml}
        </div>
    </div>

    <!-- Tab 2: Custom Tests -->
    <div id="custom-tab" class="tab-content">
        <p style="color: var(--vscode-descriptionForeground); margin-bottom: 15px;">
            ➕ Add your own test cases with custom input values
        </p>

        <div class="custom-test-header">
            <div>Test Name</div>
            ${paramNames.map(p => `<div>${p}</div>`).join('')}
            <div>Expected</div>
            <div></div>
        </div>

        <div id="custom-tests-container">
            <!-- Custom tests will be added here -->
        </div>

        <button class="btn btn-secondary add-custom-btn" onclick="addCustomTest()">
            <span>➕</span>
            <span>Add Custom Test</span>
        </button>
        </div>
        <!-- Tab 3: Preview -->
        <div id="preview-tab" class="tab-content">
            <p style="color: var(--vscode-descriptionForeground); margin-bottom: 15px;">
                👁️ Preview of the generated test file. Save to apply your expected values.
            </p>
            <div class="preview-container">
                <pre class="code-preview" id="code-preview-content">${escapedCode ? this.syntaxHighlight(escapedCode) : '<!-- No preview available -->'}</pre>
            </div>
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
        let customTestCounter = 0;
        const paramNames = ${JSON.stringify(paramNames)};

        function updateSelectedCount() {
            const checkboxes = document.querySelectorAll('.test-enabled-checkbox');
            let selected = 0;
            checkboxes.forEach(cb => {
                const testCase = document.getElementById('test-case-' + cb.getAttribute('data-test-index'));
                if (cb.checked) {
                    selected++;
                    if (testCase) { testCase.classList.remove('disabled'); }
                } else {
                    if (testCase) { testCase.classList.add('disabled'); }
                }
            });
            document.getElementById('selected-count').textContent = selected;
        }
        function getDisabledTests() {
            const checkboxes = document.querySelectorAll('.test-enabled-checkbox');
            const disabled = [];
            checkboxes.forEach(cb => {
                if (!cb.checked) {
                    disabled.push(parseInt(cb.getAttribute('data-test-index'), 10));
                }
            });
            return disabled;
        }
        function switchTab(evt, tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            evt.target.classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabName + '-tab').classList.add('active');
        }

        function addCustomTest() {
            const container = document.getElementById('custom-tests-container');
            const testId = customTestCounter++;
            
            // Generate unique timestamp-based name
            const timestamp = Date.now().toString().slice(-6);
            const defaultName = 'Custom_' + timestamp + '_' + (testId + 1);

            const row = document.createElement('div');
            row.className = 'custom-test-row';
            row.setAttribute('data-custom-id', testId);
            
            let html = '<input type="text" class="custom-name-input" placeholder="' + defaultName + '" value="' + defaultName + '" />';
            
            paramNames.forEach(param => {
                html += '<input type="text" class="custom-param-input" data-param="' + param + '" placeholder="0" />';
            });
            
            html += '<input type="text" class="custom-expected-input" placeholder="0" />';
            html += '<button class="remove-btn" onclick="removeCustomTest(' + testId + ')">✖</button>';
            
            row.innerHTML = html;
            container.appendChild(row);

            updateCustomCount();
        }

        function removeCustomTest(testId) {
            const row = document.querySelector('[data-custom-id="' + testId + '"]');
            if (row) {
                row.remove();
                updateCustomCount();
            }
        }

        function updateCustomCount() {
            const count = document.querySelectorAll('.custom-test-row').length;
            document.getElementById('custom-count').textContent = count;
            document.getElementById('custom-tab-count').textContent = count;
        }

        function collectBoundaryValues() {
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

        function collectCustomTests() {
            const rows = document.querySelectorAll('.custom-test-row');
            const customTests = [];

            rows.forEach((row, index) => {
                const name = row.querySelector('.custom-name-input').value.trim() || ('CustomTest' + (index + 1));
                const paramInputs = row.querySelectorAll('.custom-param-input');
                const expected = row.querySelector('.custom-expected-input').value.trim() || '0';

                const params = {};
                paramInputs.forEach(input => {
                    const paramName = input.getAttribute('data-param');
                    params[paramName] = input.value.trim() || '0';
                });

                customTests.push({ name, params, expected });
            });

            return customTests;
        }

        function saveAndRun() {
            const values = collectBoundaryValues();
            const customTests = collectCustomTests();
            const disabledTests = getDisabledTests();
            vscode.postMessage({
                command: 'save',
                values: values,
                customTests: customTests,
                disabledTests: disabledTests
            });
        }

        function saveOnly() {
            const values = collectBoundaryValues();
            const customTests = collectCustomTests();
            const disabledTests = getDisabledTests();
            vscode.postMessage({
                command: 'saveOnly',
                values: values,
                customTests: customTests,
                disabledTests: disabledTests
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
            updateSelectedCount();
        });

        // Allow Enter key to move to next input
        document.querySelectorAll('.expected-input').forEach((input, index, inputs) => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                }
            });
        });
    </script>
</body>
</html>`;
    }

    /**
    * Apply basic syntax highlighting to HTML-escaped C++ code.
     * Works on already-HTML-escaped text, inserting <span> tags.
     */
    private static syntaxHighlight(escapedCode: string): string {
        return escapedCode
            // Comments  // ...
            .replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>')
            // #include / #define preprocessor
            .replace(/(#\w+)/g, '<span class="inc">$1</span>')
            // C++ keywords and GTest macros
            .replace(/\b(TEST|TEST_F|EXPECT_EQ|EXPECT_FLOAT_EQ|EXPECT_DOUBLE_EQ|EXPECT_NEAR|EXPECT_TRUE|EXPECT_FALSE|FAIL|SUCCEED|extern|class|protected|void|return|if|else|for|while|do|break|continue|nullptr|NULL|true|false|override)\b/g,
                '<span class="kw">$1</span>')
            // C types
            .replace(/\b(int|float|double|char|long|short|unsigned|signed|struct|size_t|bool)\b/g,
                '<span class="typ">$1</span>')
            // Numbers (simple)
            .replace(/\b(\d+\.?\d*[fFlLuU]*)\b/g, '<span class="num">$1</span>');
    }
    /**
     * Save expected values to test file.
     * Disabled test indices are commented out rather than having FAIL() replaced.
     */
    private static async saveExpectedValues(
        testFilePath: string,
        values: Array<{ index: number; value: string }>,
        disabledTests: number[] = []
    ): Promise<void> {

        try {
            let content = await fs.promises.readFile(testFilePath, 'utf8');
            const lines = content.split('\n');
            let testIndex = -1;
            // Track lines that mark the start of a disabled TEST block
            const disabledStartLines = new Set<number>();

            // First pass: identify which TEST blocks are disabled and mark their start
            if (disabledTests.length > 0) {
                let idx = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('TEST(') || lines[i].includes('TEST_F(')) {
                        idx++;
                        if (disabledTests.includes(idx)) {
                            disabledStartLines.add(i);
                        }
                    }
                }
            }
            // Second pass: comment out disabled TEST blocks
            if (disabledStartLines.size > 0) {
                let inDisabledBlock = false;
                let braceDepth = 0;
                for (let i = 0; i < lines.length; i++) {
                    if (disabledStartLines.has(i)) {
                        inDisabledBlock = true;
                        braceDepth = 0;
                    }
                    if (inDisabledBlock) {
                        for (const ch of lines[i]) {
                            if (ch === '{') { braceDepth++; }
                            if (ch === '}') {
                                braceDepth--;
                                if (braceDepth === 0) {
                                    lines[i] = '// ' + lines[i];
                                    inDisabledBlock = false;
                                    break;
                                }
                            }
                        }
                        if (inDisabledBlock) {
                            lines[i] = '// ' + lines[i];
                        }
                    }
                }
            }
            testIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (line.includes('TEST(') || line.includes('TEST_F(')) {
                    testIndex++;
                }

                if (line.includes('// TODO: Provide expected value')) {
                    const valueEntry = values.find(v => v.index === testIndex);
                    if (valueEntry && i + 1 < lines.length && lines[i + 1].includes('FAIL()')) {
                        const indent = lines[i + 1].match(/^\s*/)?.[0] || '    ';
                        const trimmedValue = valueEntry.value.trim().toLowerCase();

                        if (trimmedValue === 'overflow') {
                            lines[i] = `${indent}// Expected: Overflow behavior`;
                            lines[i + 1] = `${indent}SUCCEED() << "Overflow case - result: " << result;`;
                        } else if (trimmedValue === 'undefined' || trimmedValue === 'ub') {
                            lines[i] = `${indent}// Expected: Undefined behavior`;
                            lines[i + 1] = `${indent}SUCCEED() << "Undefined behavior case - result: " << result;`;
                        } else if (trimmedValue === 'skip' || trimmedValue === '') {
                            continue;
                        } else {
                            lines[i] = `${indent}EXPECT_EQ(result, ${valueEntry.value});`;
                            lines.splice(i + 1, 1);
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
    * Save custom tests to test file (NEW FUNCTIONALITY)
    */
    private static async saveCustomTests(
        testFilePath: string,
        functionName: string,
        paramNames: string[],
        customTests: Array<{name: string; params: {[key: string]: string}; expected: string}>
    ): Promise<void> {
        if (!customTests || customTests.length === 0) {
            console.log('No custom tests to save');
            return;
        }

        try {
            console.log('Saving custom tests:', JSON.stringify(customTests, null, 2));
            
            let content = await fs.promises.readFile(testFilePath, 'utf8');

            // Read existing test names to avoid duplicates
            const existingTestNames = new Set<string>();
            const testNameRegex = /TEST\(\w+Test,\s*(\w+)\)/g;
            let match;
            while ((match = testNameRegex.exec(content)) !== null) {
                existingTestNames.add(match[1]);
            }

            // Generate custom test code
            let customTestsCode = '\n// ============================================================================\n';
            customTestsCode += '// Custom Tests (User-Defined)\n';
            customTestsCode += '// ============================================================================\n\n';

            for (let i = 0; i < customTests.length; i++) {
                const test = customTests[i];
                
                if (!test.name || !test.params) {
                    console.warn('Skipping invalid test:', test);
                    continue;
                }

                // Sanitize and ensure unique name
                let testName = this.sanitizeTestName(test.name);
                let uniqueName = testName;
                let counter = 1;
                
                // If name already exists, append number
                while (existingTestNames.has(uniqueName)) {
                    uniqueName = `${testName}_${counter}`;
                    counter++;
                }
                
                existingTestNames.add(uniqueName);

                customTestsCode += `TEST(${functionName}Test, ${uniqueName}) {\n`;
                customTestsCode += '    // Arrange (Custom)\n';

                // Iterate through parameter names and get values from params object
                for (const paramName of paramNames) {
                    const value = test.params[paramName] || '0';
                    customTestsCode += `    int ${paramName} = ${value};\n`;
                }

                customTestsCode += '\n    // Act\n';
                customTestsCode += `    int result = ${functionName}(${paramNames.join(', ')});\n`;
                customTestsCode += '\n    // Assert\n';
                
                const expectedValue = test.expected || '0';
                customTestsCode += `    EXPECT_EQ(result, ${expectedValue});\n`;
                customTestsCode += '}\n\n';
            }

            // Append to end of file
            content = content.trimEnd() + '\n' + customTestsCode;

            await fs.promises.writeFile(testFilePath, content, 'utf8');
            console.log(`Successfully saved ${customTests.length} custom test(s)`);
        } catch (error) {
            console.error('Failed to save custom tests:', error);
            vscode.window.showErrorMessage(`Failed to save custom tests: ${error}`);
            throw error;
        }
    }

    /**
     * Sanitize test name for C++
     */
    private static sanitizeTestName(name: string): string {
        // Remove/replace invalid characters
        let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
        
        // Ensure it doesn't start with a number
        if (/^\d/.test(sanitized)) {
            sanitized = 'Custom_' + sanitized;
        }
        
        // Ensure it's not empty
        if (sanitized.length === 0) {
            sanitized = 'CustomTest';
        }
        
        return sanitized;
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