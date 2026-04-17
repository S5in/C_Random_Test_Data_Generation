import * as assert from 'assert';
import { GlobalExtractor } from '../parser/globalExtractor';
import { GlobalVariable } from '../types';
import { parseC } from './parserTestHelper';

suite('GlobalExtractor — basic global variables', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
int counter;
float ratio;
char flag;
`;
        tree = await parseC(source);
    });

    test('extracts global int variable', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const g = globals.find((g: GlobalVariable) => g.name === 'counter');
        assert.ok(g, 'should find counter');
        assert.ok(g.type.includes('int'), 'type should be int');
    });

    test('extracts global float variable', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const g = globals.find((g: GlobalVariable) => g.name === 'ratio');
        assert.ok(g, 'should find ratio');
    });

    test('extracts multiple globals', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        assert.ok(globals.length >= 3, 'should extract at least 3 globals');
    });

    test('uninitialized globals have undefined initialValue', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const g = globals.find((g: GlobalVariable) => g.name === 'counter');
        assert.strictEqual(g?.initialValue, undefined);
    });
});

suite('GlobalExtractor — initialized global variables', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
int maxCount = 100;
float pi = 3.14;
char separator = ',';
`;
        tree = await parseC(source);
    });

    test('extracts initialValue for initialized int global', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const g = globals.find((g: GlobalVariable) => g.name === 'maxCount');
        assert.ok(g, 'should find maxCount');
        assert.strictEqual(g?.initialValue, '100');
    });

    test('extracts initialValue for initialized float global', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const g = globals.find((g: GlobalVariable) => g.name === 'pi');
        assert.ok(g, 'should find pi');
        assert.ok(g?.initialValue?.includes('3.14'), 'initialValue should contain 3.14');
    });
});

suite('GlobalExtractor — const globals', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
const int MAX_SIZE = 256;
const float EPSILON = 0.0001;
`;
        tree = await parseC(source);
    });

    test('marks const globals as isConst=true', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const g = globals.find((g: GlobalVariable) => g.name === 'MAX_SIZE');
        assert.ok(g, 'should find MAX_SIZE');
        assert.strictEqual(g?.isConst, true, 'const global should have isConst=true');
    });

    test('const type includes "const" keyword', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const g = globals.find((g: GlobalVariable) => g.name === 'MAX_SIZE');
        assert.ok(g?.type.includes('const'), 'type should include const keyword');
    });
});

suite('GlobalExtractor — static globals', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
static int instance_count = 0;
static float cached_value;
`;
        tree = await parseC(source);
    });

    test('marks static globals as isStatic=true', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const g = globals.find((g: GlobalVariable) => g.name === 'instance_count');
        assert.ok(g, 'should find instance_count');
        assert.strictEqual(g?.isStatic, true, 'static global should have isStatic=true');
    });
});

suite('GlobalExtractor — pointer globals', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
int *buffer;
char *message;
`;
        tree = await parseC(source);
    });

    test('extracts pointer global variable names', () => {
        const globals = GlobalExtractor.extractGlobals(tree);
        const buf = globals.find((g: GlobalVariable) => g.name === 'buffer');
        const msg = globals.find((g: GlobalVariable) => g.name === 'message');
        assert.ok(buf, 'should find buffer');
        assert.ok(msg, 'should find message');
    });
});

suite('GlobalExtractor — edge cases', () => {

    test('returns empty array for source with only functions', async () => {
        const source = `
int add(int a, int b) { return a + b; }
void noop() { }
`;
        const tree = await parseC(source);
        const globals = GlobalExtractor.extractGlobals(tree);
        assert.deepStrictEqual(globals, [], 'no globals should be found in function-only source');
    });

    test('does not return function parameters as globals', async () => {
        const source = `
int x;
int fn(int y) { return x + y; }
`;
        const tree = await parseC(source);
        const globals = GlobalExtractor.extractGlobals(tree);
        const paramAsGlobal = globals.find((g: GlobalVariable) => g.name === 'y');
        assert.strictEqual(paramAsGlobal, undefined, 'function parameters should not appear as globals');
    });
});
