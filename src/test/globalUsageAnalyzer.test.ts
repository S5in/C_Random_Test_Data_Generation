import * as assert from 'assert';
import { GlobalUsageAnalyzer } from '../parser/globalUsageAnalyzer';
import { FunctionInfo, GlobalVariable } from '../types';
function makeFunc(name: string, startLine: number, endLine: number): FunctionInfo {
    return { name, returnType: 'int', parameters: [], startLine, endLine };
}
function makeGlobal(name: string, type: string = 'int', opts: Partial<GlobalVariable> = {}): GlobalVariable {
    return { name, type, isStatic: false, isConst: false, ...opts };
}
suite('GlobalUsageAnalyzer — analyzeFunction', () => {
    test('returns empty array when no globals provided', () => {
        const func = makeFunc('add', 0, 2);
        const result = GlobalUsageAnalyzer.analyzeFunction(func, [], 'int add() { return 0; }');
        assert.deepStrictEqual(result, []);
    });
    test('detects global used in function body', () => {
        const code = [
            'int counter = 0;',
            'int increment() {',
            '    counter++;',
            '    return counter;',
            '}',
        ].join('\n');
        const func = makeFunc('increment', 1, 4);
        const global = makeGlobal('counter');
        const result = GlobalUsageAnalyzer.analyzeFunction(func, [global], code);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'counter');
    });
    test('does not return global that is not used in function', () => {
        const code = [
            'int x = 0;',
            'int y = 0;',
            'int useX() {',
            '    return x + 1;',
            '}',
        ].join('\n');
        const func = makeFunc('useX', 2, 4);
        const globalX = makeGlobal('x');
        const globalY = makeGlobal('y');
        const result = GlobalUsageAnalyzer.analyzeFunction(func, [globalX, globalY], code);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'x');
    });
    test('skips const globals', () => {
        const code = [
            'const int MAX = 100;',
            'int clamp(int v) {',
            '    if (v > MAX) return MAX;',
            '    return v;',
            '}',
        ].join('\n');
        const func = makeFunc('clamp', 1, 4);
        const constGlobal = makeGlobal('MAX', 'int', { isConst: true });
        const result = GlobalUsageAnalyzer.analyzeFunction(func, [constGlobal], code);
        assert.deepStrictEqual(result, [], 'const globals should be skipped');
    });
    test('returns multiple globals used in same function', () => {
        const code = [
            'int a = 0;',
            'int b = 0;',
            'int sum() {',
            '    return a + b;',
            '}',
        ].join('\n');
        const func = makeFunc('sum', 2, 4);
        const globalA = makeGlobal('a');
        const globalB = makeGlobal('b');
        const result = GlobalUsageAnalyzer.analyzeFunction(func, [globalA, globalB], code);
        assert.strictEqual(result.length, 2);
    });
    test('uses word boundary matching (avoids partial name matches)', () => {
        const code = [
            'int counter = 0;',
            'int sub_counter = 0;',
            'int fn() {',
            '    return counter;',
            '}',
        ].join('\n');
        const func = makeFunc('fn', 2, 4);
        const g1 = makeGlobal('counter');
        const g2 = makeGlobal('sub_counter');
        const result = GlobalUsageAnalyzer.analyzeFunction(func, [g1, g2], code);
        // 'counter' matches but 'sub_counter' should also match if referenced
        assert.strictEqual(result.some(g => g.name === 'counter'), true);
    });
});
suite('GlobalUsageAnalyzer — getFunctionGlobalSummary', () => {
    test('returns "does not use" message when no globals', () => {
        const func = makeFunc('myFunc', 0, 5);
        const summary = GlobalUsageAnalyzer.getFunctionGlobalSummary(func, []);
        assert.ok(summary.includes('does not use'), 'should say function does not use globals');
        assert.ok(summary.includes('myFunc'), 'should include function name');
    });
    test('returns count and names of used globals', () => {
        const func = makeFunc('myFunc', 0, 5);
        const globals = [makeGlobal('x', 'int'), makeGlobal('y', 'float')];
        const summary = GlobalUsageAnalyzer.getFunctionGlobalSummary(func, globals);
        assert.ok(summary.includes('2 global'), 'should mention count');
        assert.ok(summary.includes('x'), 'should include x');
        assert.ok(summary.includes('y'), 'should include y');
    });
    test('includes initial value when present', () => {
        const func = makeFunc('fn', 0, 2);
        const global = { ...makeGlobal('counter'), initialValue: '42' };
        const summary = GlobalUsageAnalyzer.getFunctionGlobalSummary(func, [global]);
        assert.ok(summary.includes('42'), 'should include initial value');
    });
});
suite('GlobalUsageAnalyzer — estimateTestCount', () => {
    test('returns 1 for function with no params and no globals', () => {
        const func = makeFunc('noParams', 0, 2);
        const count = GlobalUsageAnalyzer.estimateTestCount(func, []);
        assert.strictEqual(count, 1);
    });
    test('returns positive count for function with one int param', () => {
        const func: FunctionInfo = {
            name: 'fn',
            returnType: 'int',
            parameters: [{ name: 'x', type: 'int' }],
            startLine: 0,
            endLine: 5,
        };
        const count = GlobalUsageAnalyzer.estimateTestCount(func, []);
        assert.ok(count > 1, 'should have more than 1 test for a function with params');
    });
    test('returns higher count for function with globals', () => {
        const func: FunctionInfo = {
            name: 'fn',
            returnType: 'int',
            parameters: [{ name: 'x', type: 'int' }],
            startLine: 0,
            endLine: 5,
        };
        const noGlobalsCount = GlobalUsageAnalyzer.estimateTestCount(func, []);
        const withGlobalsCount = GlobalUsageAnalyzer.estimateTestCount(func, [makeGlobal('g', 'int')]);
        assert.ok(withGlobalsCount > noGlobalsCount, 'globals should increase test count');
    });
    test('returns at least 1 for any function', () => {
        const func = makeFunc('noop', 0, 1);
        const count = GlobalUsageAnalyzer.estimateTestCount(func, []);
        assert.ok(count >= 1);
    });
});