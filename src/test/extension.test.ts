import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('extension is present in extensions list', () => {
		// The extension ID matches publisher.name from package.json
		const ext = vscode.extensions.getExtension('S5in.s5in-c-bva-test-generator');
		assert.ok(ext !== undefined, 'Extension should be present in VS Code extensions list');
	});
});
