import * as assert from 'assert';
import { FunctionExtractor } from '../parser/functionExtractor';
import { FunctionInfo } from '../types';
import { parseC } from './parserTestHelper';

suite('FunctionExtractor — extractFunctions (definitions)', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
int add(int a, int b) {
    return a + b;
}

float divide(float x, float y) {
    return x / y;
}

void doNothing() {
}
`;
        tree = await parseC(source);
    });

    test('extracts all function definitions', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        assert.ok(funcs.length >= 3, 'should extract at least 3 functions');
    });

    test('extracts function name correctly', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const names = funcs.map((f: FunctionInfo) => f.name);
        assert.ok(names.includes('add'), 'should extract "add"');
        assert.ok(names.includes('divide'), 'should extract "divide"');
        assert.ok(names.includes('doNothing'), 'should extract "doNothing"');
    });

    test('extracts return type correctly', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const addFunc = funcs.find((f: FunctionInfo) => f.name === 'add');
        assert.strictEqual(addFunc?.returnType, 'int');
    });

    test('extracts float return type', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const divFunc = funcs.find((f: FunctionInfo) => f.name === 'divide');
        assert.strictEqual(divFunc?.returnType, 'float');
    });

    test('extracts void return type', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const noop = funcs.find((f: FunctionInfo) => f.name === 'doNothing');
        assert.strictEqual(noop?.returnType, 'void');
    });

    test('extracts parameter count', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const addFunc = funcs.find((f: FunctionInfo) => f.name === 'add');
        assert.strictEqual(addFunc?.parameters.length, 2);
    });

    test('extracts parameter names and types', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const addFunc = funcs.find((f: FunctionInfo) => f.name === 'add');
        assert.ok(addFunc, 'add function should exist');
        assert.strictEqual(addFunc.parameters[0].name, 'a');
        assert.strictEqual(addFunc.parameters[0].type, 'int');
        assert.strictEqual(addFunc.parameters[1].name, 'b');
        assert.strictEqual(addFunc.parameters[1].type, 'int');
    });

    test('void function has no parameters', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const noop = funcs.find((f: FunctionInfo) => f.name === 'doNothing');
        assert.strictEqual(noop?.parameters.length, 0);
    });

    test('records startLine and endLine', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const addFunc = funcs.find((f: FunctionInfo) => f.name === 'add');
        assert.ok(addFunc, 'add function should exist');
        assert.ok(addFunc.startLine >= 0, 'startLine should be non-negative');
        assert.ok(addFunc.endLine > addFunc.startLine, 'endLine should be after startLine');
    });
});

suite('FunctionExtractor — pointer and array parameters', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
int strlen_impl(const char *s) {
    int n = 0;
    while (*s++) n++;
    return n;
}

int sumArray(int *arr, int size) {
    int total = 0;
    for (int i = 0; i < size; i++) total += arr[i];
    return total;
}

void fillArray(int arr[], int n, int val) {
}
`;
        tree = await parseC(source);
    });

    test('extracts pointer parameter type', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const fn = funcs.find((f: FunctionInfo) => f.name === 'strlen_impl');
        assert.ok(fn, 'strlen_impl should be found');
        const sParam = fn.parameters[0];
        assert.ok(sParam.type.includes('*') || sParam.type.includes('char'), 'should include pointer type');
    });

    test('extracts array parameter', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const fn = funcs.find((f: FunctionInfo) => f.name === 'fillArray');
        assert.ok(fn, 'fillArray should be found');
        const arrParam = fn.parameters[0];
        assert.ok(arrParam.name === 'arr', 'array param name should be arr');
    });
});

suite('FunctionExtractor — extractFunctionDeclarations (prototypes)', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
int add(int a, int b);
float multiply(float x, float y);
void reset(void);
`;
        tree = await parseC(source);
    });

    test('extracts function declarations', () => {
        const decls = FunctionExtractor.extractFunctionDeclarations(tree);
        const names = decls.map((f: FunctionInfo) => f.name);
        assert.ok(names.includes('add'), 'should find add declaration');
        assert.ok(names.includes('multiply'), 'should find multiply declaration');
    });

    test('declaration has correct return type', () => {
        const decls = FunctionExtractor.extractFunctionDeclarations(tree);
        const addDecl = decls.find((f: FunctionInfo) => f.name === 'add');
        assert.strictEqual(addDecl?.returnType, 'int');
    });

    test('declaration has correct parameters', () => {
        const decls = FunctionExtractor.extractFunctionDeclarations(tree);
        const addDecl = decls.find((f: FunctionInfo) => f.name === 'add');
        assert.ok(addDecl, 'add declaration should exist');
        assert.strictEqual(addDecl.parameters.length, 2);
        assert.strictEqual(addDecl.parameters[0].type, 'int');
    });
});

suite('FunctionExtractor — extractAllFunctions', () => {
    let tree: any;

    suiteSetup(async () => {
        // Mix of definition and declaration with same name
        const source = `
int helper(int x);

int add(int a, int b) {
    return a + b;
}
`;
        tree = await parseC(source);
    });

    test('deduplicates by function name', () => {
        const all = FunctionExtractor.extractAllFunctions(tree);
        const names = all.map((f: FunctionInfo) => f.name);
        const unique = new Set(names);
        assert.strictEqual(names.length, unique.size, 'no duplicates should exist');
    });

    test('includes both definitions and declarations', () => {
        const all = FunctionExtractor.extractAllFunctions(tree);
        const names = all.map((f: FunctionInfo) => f.name);
        assert.ok(names.includes('helper'), 'should include declaration');
        assert.ok(names.includes('add'), 'should include definition');
    });
});

suite('FunctionExtractor — findFunctionAtLine', () => {
    let tree: any;
    let addStartLine: number;

    suiteSetup(async () => {
        const source = `
int add(int a, int b) {
    return a + b;
}
`;
        tree = await parseC(source);
        const funcs = FunctionExtractor.extractFunctions(tree);
        const addFunc = funcs.find((f: FunctionInfo) => f.name === 'add');
        addStartLine = addFunc?.startLine ?? 1;
    });

    test('finds function when cursor is on start line', () => {
        const func = FunctionExtractor.findFunctionAtLine(tree, addStartLine);
        assert.ok(func, 'should find function');
        assert.strictEqual(func?.name, 'add');
    });

    test('returns null when line is outside all functions', () => {
        const func = FunctionExtractor.findFunctionAtLine(tree, 9999);
        assert.strictEqual(func, null, 'should return null for line outside functions');
    });
});

suite('FunctionExtractor — const qualifier', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
int process(const int x, const char *s) {
    return x;
}
`;
        tree = await parseC(source);
    });

    test('handles const-qualified parameters', () => {
        const funcs = FunctionExtractor.extractFunctions(tree);
        const fn = funcs.find((f: FunctionInfo) => f.name === 'process');
        assert.ok(fn, 'process should be found');
        assert.strictEqual(fn.parameters.length, 2);
    });
});
