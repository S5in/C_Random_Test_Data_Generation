import * as assert from 'assert';
import { TestGenerator, TestCaseInfo } from '../generator/testGenerator';
import { FunctionInfo, GlobalVariable } from '../types';

function makeVoidFunc(name: string): FunctionInfo {
    return { name, returnType: 'void', parameters: [], startLine: 0, endLine: 5 };
}

function makeIntFunc(name: string, params: { name: string; type: string }[]): FunctionInfo {
    return { name, returnType: 'int', parameters: params, startLine: 0, endLine: 10 };
}

function makeFloatFunc(name: string, params: { name: string; type: string }[]): FunctionInfo {
    return { name, returnType: 'float', parameters: params, startLine: 0, endLine: 10 };
}

suite('TestGenerator — generateTestsWithCaseInfo basics', () => {

    test('output contains the function name in TEST() macro', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', []);
        assert.ok(testCode.includes('addTest'), 'should have addTest fixture in TEST() macro');
    });

    test('output includes source file include', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', []);
        assert.ok(testCode.includes('math.c') || testCode.includes('#include'), 'should include source file reference');
    });

    test('returns non-empty testCases array', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const { testCases } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', []);
        assert.ok(testCases.length > 0, 'should generate at least one test case');
    });

    test('void function generates test code', () => {
        const func = makeVoidFunc('doSomething');
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'util.c', []);
        assert.ok(testCode.length > 0, 'should generate test code for void function');
        assert.ok(testCode.includes('doSomethingTest'), 'should have function name in test');
    });

    test('float return type uses EXPECT_FLOAT_EQ or FAIL placeholder', () => {
        const func = makeFloatFunc('compute', [{ name: 'x', type: 'float' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'compute.c', []);
        const hasFloatAssert = testCode.includes('EXPECT_FLOAT_EQ') ||
                               testCode.includes('FAIL()') ||
                               testCode.includes('EXPECT_TRUE');
        assert.ok(hasFloatAssert, 'float return should produce float assertion');
    });

    test('code includes gtest header', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', []);
        assert.ok(testCode.includes('gtest/gtest.h') || testCode.includes('<gtest'), 'should include gtest header');
    });
});

suite('TestGenerator — density and options', () => {

    test('standard density generates more tests than minimal', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const { testCases: minimal } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', [], 'minimal', [], false, { numberOfRandomValues: 0 });
        const { testCases: standard } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', [], 'standard', [], false, { numberOfRandomValues: 0 });
        assert.ok(standard.length >= minimal.length, 'standard should have >= tests than minimal');
    });

    test('numberOfRandomValues=0 does not add random tests', () => {
        const func = makeIntFunc('fn', [{ name: 'x', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'fn.c', [], 'standard', [], false, { numberOfRandomValues: 0 });
        assert.strictEqual(testCode.includes('Random'), false, 'no random tests should be generated');
    });

    test('numberOfRandomValues=3 adds random tests', () => {
        const func = makeIntFunc('fn', [{ name: 'x', type: 'int' }]);
        const { testCode, testCases } = TestGenerator.generateTestsWithCaseInfo(func, 'fn.c', [], 'standard', [], false, { numberOfRandomValues: 3 });
        const hasRandom = testCode.includes('Random') || testCases.some((tc: TestCaseInfo) => tc.testName.includes('Random'));
        assert.ok(hasRandom, 'random tests should be generated when numberOfRandomValues > 0');
    });
});

suite('TestGenerator — pointer and array parameters', () => {

    test('pointer parameter generates null pointer test', () => {
        const func = makeIntFunc('process', [{ name: 'ptr', type: 'int *' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'proc.c', [], 'standard', [], false, { numberOfRandomValues: 0 });
        assert.ok(testCode.includes('NULL'), 'pointer param should have NULL test case');
    });

    test('char pointer parameter gets NULL test', () => {
        const func: FunctionInfo = {
            name: 'strlen_test',
            returnType: 'int',
            parameters: [{ name: 's', type: 'char *' }],
            startLine: 0, endLine: 5,
        };
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'str.c', [], 'standard', [], false, { numberOfRandomValues: 0 });
        assert.ok(testCode.includes('NULL'), 'char* param should have NULL test case');
    });
});

suite('TestGenerator — with global variables', () => {

    test('generates TEST_F fixture when globals are used', () => {
        const func = makeIntFunc('compute', [{ name: 'x', type: 'int' }]);
        const globals: GlobalVariable[] = [{ name: 'g_state', type: 'int', isStatic: false, isConst: false }];
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'comp.c', globals, 'standard', [], false, { numberOfRandomValues: 0 });
        assert.ok(testCode.includes('TEST_F'), 'should use TEST_F fixture when globals are present');
    });

    test('generates global variable boundary tests', () => {
        const func = makeIntFunc('compute', []);
        const globals: GlobalVariable[] = [{ name: 'g_val', type: 'int', isStatic: false, isConst: false }];
        const { testCases } = TestGenerator.generateTestsWithCaseInfo(func, 'comp.c', globals, 'standard', [], false, { numberOfRandomValues: 0 });
        assert.ok(testCases.length > 0, 'should generate test cases when globals are present');
    });
});

suite('TestGenerator — header file mode', () => {

    test('isHeaderFile=true wraps includes in extern "C"', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'math.h', [], 'standard', [], true, { numberOfRandomValues: 0 });
        assert.ok(testCode.includes('extern "C"'), 'header file mode should wrap include in extern "C"');
    });
});

suite('TestGenerator — output format', () => {

    test('plain format omits gtest header', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', [], 'standard', [], false, { outputFormat: 'plain', numberOfRandomValues: 0 });
        assert.strictEqual(testCode.includes('gtest/gtest.h'), false, 'plain format should not include gtest header');
        assert.ok(testCode.includes('plain format'), 'plain format header should mention plain format');
    });

    test('googletest format uses TEST() macros', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', [], 'standard', [], false, { outputFormat: 'googletest', numberOfRandomValues: 0 });
        assert.ok(testCode.includes('TEST('), 'googletest format should use TEST() macros');
    });

    test('plain format does not include random tests', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'math.c', [], 'standard', [], false, { outputFormat: 'plain', numberOfRandomValues: 5 });
        assert.strictEqual(testCode.includes('Random'), false, 'plain format should not include random tests');
    });
});

suite('TestGenerator — climits and cfloat headers', () => {

    test('int params include climits header', () => {
        const func = makeIntFunc('fn', [{ name: 'x', type: 'int' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'fn.c', [], 'standard', [], false, { numberOfRandomValues: 0 });
        assert.ok(testCode.includes('climits'), 'int params should require climits header');
    });

    test('float params include cfloat header', () => {
        const func = makeFloatFunc('fn', [{ name: 'x', type: 'float' }]);
        const { testCode } = TestGenerator.generateTestsWithCaseInfo(func, 'fn.c', [], 'standard', [], false, { numberOfRandomValues: 0 });
        assert.ok(testCode.includes('cfloat'), 'float params should require cfloat header');
    });
});

suite('TestGenerator — deprecated generateTestsForFunction', () => {
    test('returns a string', () => {
        const func = makeIntFunc('add', [{ name: 'a', type: 'int' }]);
        const code = TestGenerator.generateTestsForFunction(func, 'math.c', []);
        assert.strictEqual(typeof code, 'string');
        assert.ok(code.length > 0);
    });
});
