/**
 * Test Generator
 *
 * Generates Google Test code for C functions.
 * NO BEHAVIOR GUESSING - All expected values must be provided by the developer.
 *
 * Iteration 2 additions:
 *   - Correct assertion macros per return type (EXPECT_FLOAT_EQ, EXPECT_DOUBLE_EQ)
 *   - Pointer / array / struct parameter declarations via paramDeclarations/paramPreambles
 *   - testDensity support forwarded to generateBoundarySets()
 */

import { FunctionInfo, FunctionParameter, GlobalVariable, StructInfo } from '../types';
import { generateBoundarySets, getBoundariesForType, TestDensity, BoundaryOptions, isPointerType, isArrayType, isStructType, detectArraySizePairs, getBoundaryValues, isFloatSpecialValue, isNegativeFiniteFloat } from './boundaryValues';
export interface TestCaseInfo {
    testName: string;
    inputs: string;
    paramValues: { name: string; value: string }[];
    globalValues?: { name: string; value: string }[];
}
/**
 * Options that control test generation behavior.
 * All fields are optional; safe defaults mirror the package.json setting defaults.
 */
export interface GeneratorOptions extends BoundaryOptions {
    /** Number of additional random-value test cases to append. Default: 5. */
    numberOfRandomValues?: number;
    /** Output format: 'googletest' (default) or 'plain' (no test framework). */
    outputFormat?: 'googletest' | 'plain';
}

export class TestGenerator {

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Generate tests AND return test case information.
     *
     * @param isHeaderFile When true, the test file will #include the source
     *   header inside an extern "C" block instead of emitting inline struct
     *   typedefs and a forward declaration.  This produces cleaner output
     *   for .h files and avoids issues with missing types/macros.
     * @param options      Optional generator options (random values, output format,
     *                     boundary filtering flags).
     */
    static generateTestsWithCaseInfo(
        func: FunctionInfo,
        sourceFileName: string,
        usedGlobals: GlobalVariable[],
        density: TestDensity = 'standard',
        funcStructDefs: StructInfo[] = [],
        isHeaderFile: boolean = false,
        options: GeneratorOptions = {}
    ): { testCode: string; testCases: TestCaseInfo[] } {

        const testCases: TestCaseInfo[] = [];
        const outputFormat = options.outputFormat ?? 'googletest';
        let testCode = (outputFormat === 'plain')
            ? this.generatePlainHeader(sourceFileName, func, funcStructDefs, usedGlobals, isHeaderFile)
            : this.generateHeader(sourceFileName, func, funcStructDefs, usedGlobals, isHeaderFile);

        if (usedGlobals.length > 0) {
            const result = this.generateFixtureTestsWithInfo(func, usedGlobals, density, options);
            testCode += result.code;
            testCases.push(...result.cases);
        } else {
            const result = this.generateRegularTestsWithInfo(func, density, options);
            testCode += result.code;
            testCases.push(...result.cases);
        }
        // Append random-value test cases (only for googletest format)
        const numRandom = options.numberOfRandomValues ?? 5;
        if (numRandom > 0 && outputFormat === 'googletest') {
            const randomResult = this.generateRandomTestsWithInfo(func, numRandom);
            testCode += randomResult.code;
            testCases.push(...randomResult.cases);
        }

        return { testCode, testCases };
    }

    /**
     * @deprecated Use generateTestsWithCaseInfo instead
     */
    static generateTestsForFunction(
        func: FunctionInfo,
        sourceFileName: string,
        usedGlobals: GlobalVariable[]
    ): string {
        return this.generateTestsWithCaseInfo(func, sourceFileName, usedGlobals).testCode;
    }

    // -----------------------------------------------------------------------
    // Regular (no globals) test generation
    // -----------------------------------------------------------------------

    private static generateRegularTestsWithInfo(
        func: FunctionInfo,
        density: TestDensity,
        options: GeneratorOptions = {}
    ): { code: string; cases: TestCaseInfo[] } {
        let code = `// ============================================================================\n`;
        code += `// Tests for: ${func.name}()\n`;
        code += `// ============================================================================\n\n`;

        const cases: TestCaseInfo[] = [];
        const boundarySets = generateBoundarySets(func.parameters, density, [], options);

        for (const set of boundarySets) {
            const testName = this.sanitizeLabel(set.label);

            code += `TEST(${func.name}Test, ${testName}) {\n`;

            if (func.parameters.length === 0) {
                code += this.emitAct(func, []);
                code += '\n';
                code += this.emitAssert(func);
            } else {
                code += '    // Arrange\n';
                for (let i = 0; i < func.parameters.length; i++) {
                    code += this.buildParamDeclaration(func.parameters[i], set, i);
                }

                if (set.skipReason) {
                    code += `\n    GTEST_SKIP() << "${set.skipReason}";\n`;
                } else {
                    code += '\n';
                    const paramNames = func.parameters.map(p => p.name);
                    code += this.emitAct(func, paramNames);
                    code += '\n';
                    code += this.emitAssert(func, set, paramNames);
                }
            }

            code += '}\n\n';

            const paramValues = func.parameters.map((p, i) => ({
                name: p.name,
                value: set.values[i] ?? '/* unset */'
            }));

            cases.push({
                testName,
                inputs: paramValues.map(p => `${p.name}=${p.value}`).join(', '),
                paramValues
            });
        }


        return { code, cases };
    }

    // -----------------------------------------------------------------------
    // Fixture (with globals) test generation
    // -----------------------------------------------------------------------

    private static generateFixtureTestsWithInfo(
        func: FunctionInfo,
        globals: GlobalVariable[],
        density: TestDensity,
        options: GeneratorOptions = {}
    ): { code: string; cases: TestCaseInfo[] } {
        // Static globals have internal linkage — they cannot be referenced from a
        // C++ translation unit (no `extern` declaration is valid for them).  Only
        // non-static globals can be saved/restored by the fixture and referenced in
        // the generated test bodies.
        const accessibleGlobals = globals.filter(g => !g.isStatic);
        // When every used global is static (none are accessible from C++), fall
        // back to regular test generation so the output compiles cleanly.
        if (accessibleGlobals.length === 0) {
            return this.generateRegularTestsWithInfo(func, density, options);
        }
        const cases: TestCaseInfo[] = [];

        let code = this.generateFixtureClass(func.name, accessibleGlobals);

        const paramResult = this.generateParameterBoundaryTestsWithInfo(func, accessibleGlobals, density, options);
        code += paramResult.code;
        cases.push(...paramResult.cases);

        const globalResult = this.generateGlobalBoundaryTestsWithInfo(func, accessibleGlobals);
        code += globalResult.code;
        cases.push(...globalResult.cases);

        const comboResult = this.generateCombinationTestsWithInfo(func, accessibleGlobals);
        code += comboResult.code;
        cases.push(...comboResult.cases);

        return { code, cases };
    }

    private static generateParameterBoundaryTestsWithInfo(
        func: FunctionInfo,
        globals: GlobalVariable[],
        density: TestDensity,
        options: GeneratorOptions = {}
    ): { code: string; cases: TestCaseInfo[] } {
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// Parameter Boundary Tests\n\n';
        const cases: TestCaseInfo[] = [];

        const boundarySets = generateBoundarySets(func.parameters, density, [], options);

        for (const set of boundarySets) {
            const testName = `Param_${this.sanitizeLabel(set.label)}`;

            code += `TEST_F(${className}, ${testName}) {\n`;
            code += '    // Set globals to default\n';
            for (const global of globals) {
                const defaultValue = global.initialValue || this.getDefaultValue(global.type);
                code += `    ${global.name} = ${defaultValue};\n`;
            }
            code += '\n';

            if (func.parameters.length === 0) {
                code += this.emitAct(func, []);
                code += '\n';
                code += this.emitAssert(func);
            } else if (set.skipReason) {
                code += '    // Arrange\n';
                for (let i = 0; i < func.parameters.length; i++) {
                    code += this.buildParamDeclaration(func.parameters[i], set, i);
                }
                code += `\n    GTEST_SKIP() << "${set.skipReason}";\n`;
            } else {
                code += '    // Arrange\n';
                for (let i = 0; i < func.parameters.length; i++) {
                    code += this.buildParamDeclaration(func.parameters[i], set, i);
                }
                code += '\n';
                const paramNames = func.parameters.map(p => p.name);
                code += this.emitAct(func, paramNames);
                code += '\n';
                code += this.emitAssert(func, set, paramNames);
            }
            code += '}\n\n';

            const paramValues = func.parameters.map((p, i) => ({
                name: p.name,
                value: set.values[i] ?? '/* unset */'
            }));
            const globalValues = globals.map(g => ({
                name: g.name,
                value: g.initialValue || '0'
            }));

            cases.push({
                testName,
                inputs: paramValues.map(p => `${p.name}=${p.value}`).join(', '),
                paramValues,
                globalValues
            });
        }

        return { code, cases };
    }

    private static generateGlobalBoundaryTestsWithInfo(
        func: FunctionInfo,
        globals: GlobalVariable[]
    ): { code: string; cases: TestCaseInfo[] } {
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// Global Variable Boundary Tests\n\n';
        const cases: TestCaseInfo[] = [];

        for (const global of globals) {
            const globalBoundaries = getBoundariesForType(global.type);

            for (const boundary of globalBoundaries) {
                const testName = `Global_${global.name}_${this.sanitizeLabel(boundary.label)}`;

                code += `TEST_F(${className}, ${testName}) {\n`;
                code += `    // Set ${global.name} to ${boundary.label}\n`;
                code += `    ${global.name} = ${boundary.literal};\n`;

                if (globals.length > 1) {
                    code += '\n';
                    for (const otherGlobal of globals) {
                        if (otherGlobal.name !== global.name) {
                            const defaultValue = otherGlobal.initialValue || this.getDefaultValue(otherGlobal.type);
                            code += `    ${otherGlobal.name} = ${defaultValue};\n`;
                        }
                    }
                }

                code += '\n';

                if (func.parameters.length > 0) {
                    code += '    // Set parameters to safe values\n';
                    for (const param of func.parameters) {
                        code += this.buildSafeParamDeclaration(param);
                    }
                }

                code += '\n';
                const paramNames = func.parameters.length > 0 ? func.parameters.map(p => p.name) : [];
                code += this.emitAct(func, paramNames);
                code += '\n';
                code += this.emitAssert(func, undefined, paramNames);
                code += '}\n\n';

                const paramValues = func.parameters.map(p => ({
                    name: p.name,
                    value: this.getSafeValue(p.type)
                }));

                cases.push({
                    testName,
                    inputs: paramValues.map(p => `${p.name}=${p.value}`).join(', '),
                    paramValues,
                    globalValues: [
                        { name: global.name, value: boundary.literal },
                        ...globals
                            .filter(g => g.name !== global.name)
                            .map(g => ({ name: g.name, value: g.initialValue || '0' }))
                    ]
                });
            }
        }

        return { code, cases };
    }

    private static generateCombinationTestsWithInfo(
        func: FunctionInfo,
        globals: GlobalVariable[]
    ): { code: string; cases: TestCaseInfo[] } {
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// Combination Tests\n\n';
        const cases: TestCaseInfo[] = [];

        const pairs = detectArraySizePairs(func.parameters);
        const sizeToArr = new Map<number, number>();
        for (const [arrIdx, sizeIdx] of pairs) {
            sizeToArr.set(sizeIdx, arrIdx);
        }

        const buildCombo = (
            comboLabel: string,
            globalBoundaryLabel: string,
            paramBoundaryLabel: string
        ) => {
            code += `TEST_F(${className}, ${comboLabel}) {\n`;
            for (const global of globals) {
                const boundaries = getBoundariesForType(global.type);
                const bv = boundaries.find(b => b.label === globalBoundaryLabel);
                if (bv) { code += `    ${global.name} = ${bv.literal};\n`; }
            }
            const comboValues: string[] = [];
            if (func.parameters.length > 0) {
                code += '\n';
                for (let pIdx = 0; pIdx < func.parameters.length; pIdx++) {
                    const param = func.parameters[pIdx];
                    if (sizeToArr.has(pIdx)) {
                        // Paired size param — use array-aware value
                        const sizeMap: Record<string, string> = { 'minimum': '0', 'maximum': '3' };
                        const val = sizeMap[paramBoundaryLabel] || '3';
                        code += `    ${param.type} ${param.name} = ${val};\n`;
                        comboValues.push(val);
                    } else if (pairs.has(pIdx)) {
                        // Paired array param — ascending content proportional to size
                        const arrSizeMap: Record<string, number> = { 'minimum': 1, 'maximum': 3 };
                        const arrSize = arrSizeMap[paramBoundaryLabel] || 3;
                        const base = param.type.replace(/\s*\[.*?\]\s*$/, '').trim();
                        const content = Array.from({ length: arrSize }, (_, i) => `${i + 1}`).join(', ');
                        code += `    ${base} ${param.name}[${arrSize}] = {${content}};\n`;
                        comboValues.push(`{${content}}`);
                    } else if (isPointerType(param.type) || isArrayType(param.type) || isStructType(param.type)) {
                        code += this.buildSafeParamDeclaration(param);
                        comboValues.push('0');
                    } else {
                        const boundaries = getBoundariesForType(param.type);
                        const bv = boundaries.find(b => b.label === paramBoundaryLabel);
                        if (bv) {
                            code += `    ${param.type} ${param.name} = ${bv.literal};\n`;
                            comboValues.push(bv.literal);
                        } else {
                            code += this.buildSafeParamDeclaration(param);
                            comboValues.push('0');
                        }
                    }
                }
            }
            code += '\n';
            const paramNames = func.parameters.length > 0 ? func.parameters.map(p => p.name) : [];
            code += this.emitAct(func, paramNames);
            code += '\n';
            // Detect if any param value is NaN/Inf or if extreme float boundary
            // values are present.  When extreme floats are detected, emitAssert()
            // emits a SUCCEED() smoke test (always passes) with a TODO comment so
            // the webview can help users replace it with a precise expected value.
            const hasSpecial = comboValues.some(v => isFloatSpecialValue(v));
            const isExtremeBoundary = paramBoundaryLabel === 'minimum' || paramBoundaryLabel === 'maximum';
            const hasFloatParam = func.parameters.some(p => {
                const t = p.type.trim().toLowerCase();
                return t === 'float' || t === 'double';
            });
            const expectsOverflow = isExtremeBoundary && hasFloatParam;
            code += this.emitAssert(func, { values: comboValues, expectsOverflow: expectsOverflow || hasSpecial }, paramNames);
            code += '}\n\n';
            cases.push({ testName: comboLabel, inputs: `Globals=${globalBoundaryLabel}, Params=${paramBoundaryLabel}`, paramValues: [], globalValues: [] });
        };

        buildCombo('Combination_AllMinimums',         'minimum', 'minimum');
        buildCombo('Combination_AllMaximums',         'maximum', 'maximum');
        buildCombo('Combination_ParamMin_GlobalMax',  'maximum', 'minimum');
        buildCombo('Combination_ParamMax_GlobalMin',  'minimum', 'maximum');

        return { code, cases };
    }

    // -----------------------------------------------------------------------
    // Private helper methods
    // -----------------------------------------------------------------------

    /**
     * Build a C++ variable declaration (and optional preamble) for a parameter
     * in a given boundary set.
     */
    private static buildParamDeclaration(
        param: { name: string; type: string },
        set: { values: string[]; paramPreambles?: (string | null)[]; paramDeclarations?: (string | null)[] },
        index: number
    ): string {
        let result = '';

        const preamble = set.paramPreambles?.[index];
        if (preamble) {
            result += `    ${preamble};\n`;
        }

        const declaration = set.paramDeclarations?.[index];
        if (declaration !== undefined && declaration !== null) {
            result += `    ${declaration};\n`;
        } else {
            const value = set.values[index] ?? '0';
            // For struct types, ensure aggregate initializer syntax {…} even if the
            // paramDeclarations override was not populated.
            const safeValue = isStructType(param.type) && !value.startsWith('{')
                ? `{${value}}`
                : value;
            result += `    ${param.type} ${param.name} = ${safeValue};\n`;
        }

        return result;
    }

    /**
     * Build a "safe" declaration for a parameter (used in global boundary tests).
     */
    private static buildSafeParamDeclaration(param: { name: string; type: string }): string {
        if (isPointerType(param.type)) {
            return `    ${param.type} ${param.name} = NULL;\n`;
        }
        if (isArrayType(param.type)) {
            const base = param.type.replace(/\s*\[.*?\]\s*$/, '').trim();
            return `    ${base} ${param.name}[10] = {0};\n`;
        }
        if (isStructType(param.type)) {
            return `    ${param.type} ${param.name} = {0};\n`;
        }
        return `    ${param.type} ${param.name} = ${this.getSafeValue(param.type)};\n`;
    }

    /**
     * Return the correct Google Test assertion macro for a return type.
     */
    private static getAssertMacro(returnType: string): string {
        const rt = returnType.trim().toLowerCase();
        if (rt === 'float')  { return 'EXPECT_FLOAT_EQ'; }
        if (rt === 'double') { return 'EXPECT_DOUBLE_EQ'; }
        return 'EXPECT_EQ';
    }

    private static generateHeader(
        sourceFileName: string,
        func: FunctionInfo,
        funcStructDefs: StructInfo[] = [],
        usedGlobals: GlobalVariable[] = [],
        isHeaderFile: boolean = false
    ): string {
        // -----------------------------------------------------------------
        // Header-file path: #include the header inside extern "C".
        // This pulls in all types, macros, and declarations automatically,
        // so we do NOT need inline struct typedefs or a forward declaration.
        // We still need extern declarations for non-static globals because
        // they are defined in a separate translation unit.
        // -----------------------------------------------------------------
        if (isHeaderFile) {
            const externGlobalsBlock = usedGlobals
                .filter(g => !g.isStatic)
                .map(g => `    extern ${g.type} ${g.name};`)
                .join('\n');
            const externCParts = [
                `    #include "${sourceFileName}"`,
                externGlobalsBlock
            ].filter(s => s.trim() !== '');
            const externBlock = `extern "C" {\n${externCParts.join('\n\n')}\n}`;
            return `// ============================================================================
// Generated Tests for ${sourceFileName}
// AUTO-GENERATED by C Test Generator v2.0.0
// ============================================================================
#include <gtest/gtest.h>
#include <climits>
#include <cfloat>
#include <cmath>
#include <cstddef>
#include <limits>
${externBlock}
`;
        }
        // -----------------------------------------------------------------
        // Source-file (.c) path: original behaviour — inline struct typedefs
        // and a forward declaration of the function under test.
        // -----------------------------------------------------------------
        // 1. Struct typedefs for each type used by the function's parameters.
        //    Emitting these inline (rather than #include-ing the source file)
        //    avoids typedef-redefinition errors when the source file itself
        //    includes a header that already defines the same type.
        const structDefsBlock = funcStructDefs
            .map(s => {
                const fields = s.fields.map(f => `    ${f.type} ${f.name};`).join('\n');
                return `    typedef struct {\n${fields}\n    } ${s.name};`;
            })
            .join('\n\n');
        // 2. extern declarations for non-static global variables so that the
        //    test fixture can save/restore them across test cases.
        //    (Static globals have internal linkage and cannot be extern'd.)
        const externGlobalsBlock = usedGlobals
            .filter(g => !g.isStatic)
            .map(g => `    extern ${g.type} ${g.name};`)
            .join('\n');
        // 3. Forward declaration of the function under test.
        const params = func.parameters.length === 0
            ? 'void'
            : func.parameters.map(p => this.formatParamForDecl(p)).join(', ');
        const forwardDecl = `    ${func.returnType} ${func.name}(${params});`;
        const externCParts = [structDefsBlock, externGlobalsBlock, forwardDecl]
            .filter(s => s.trim() !== '');
        const externBlock = `extern "C" {\n${externCParts.join('\n\n')}\n}`;
        return `// ============================================================================
// Generated Tests for ${sourceFileName}
// AUTO-GENERATED by C Test Generator v2.0.0
// ============================================================================

#include <gtest/gtest.h>
#include <climits>
#include <cfloat>
#include <cmath>
#include <cstddef>
#include <limits>

${externBlock}

`;
     }

    /**
     * Generate a plain-C header (no Google Test framework).
     * Emits #include directives and an extern "C" block just like generateHeader,
     * but without the <gtest/gtest.h> include.
     */
    private static generatePlainHeader(
        sourceFileName: string,
        func: FunctionInfo,
        funcStructDefs: StructInfo[] = [],
        usedGlobals: GlobalVariable[] = [],
        isHeaderFile: boolean = false
    ): string {
        if (isHeaderFile) {
            const externGlobalsBlock = usedGlobals
                .filter(g => !g.isStatic)
                .map(g => `    extern ${g.type} ${g.name};`)
                .join('\n');
            const externCParts = [
                `    #include "${sourceFileName}"`,
                externGlobalsBlock
            ].filter(s => s.trim() !== '');
            const externBlock = `extern "C" {\n${externCParts.join('\n\n')}\n}`;
            return `// ============================================================================
// Generated Tests for ${sourceFileName}
// AUTO-GENERATED by C Test Generator v2.0.0  (plain format)
// ============================================================================
#include <climits>
#include <cfloat>
#include <cmath>
#include <cstddef>
#include <limits>
${externBlock}
`;
        }
        const structDefsBlock = funcStructDefs
            .map(s => {
                const fields = s.fields.map(f => `    ${f.type} ${f.name};`).join('\n');
                return `    typedef struct {\n${fields}\n    } ${s.name};`;
            })
            .join('\n\n');
        const externGlobalsBlock = usedGlobals
            .filter(g => !g.isStatic)
            .map(g => `    extern ${g.type} ${g.name};`)
            .join('\n');
        const params = func.parameters.length === 0
            ? 'void'
            : func.parameters.map(p => this.formatParamForDecl(p)).join(', ');
        const forwardDecl = `    ${func.returnType} ${func.name}(${params});`;
        const externCParts = [structDefsBlock, externGlobalsBlock, forwardDecl]
            .filter(s => s.trim() !== '');
        const externBlock = `extern "C" {\n${externCParts.join('\n\n')}\n}`;
        return `// ============================================================================
// Generated Tests for ${sourceFileName}
// AUTO-GENERATED by C Test Generator v2.0.0  (plain format)
// ============================================================================
#include <climits>
#include <cfloat>
#include <cmath>
#include <cstddef>
#include <limits>
${externBlock}
`;
    }
    // -----------------------------------------------------------------------
    // Random test generation
    // -----------------------------------------------------------------------
    /**
     * Generate `count` random-value test cases for a function.
     * Only primitive (non-pointer, non-array, non-struct) parameters are randomised;
     * complex parameter types receive a nominal safe value.
     */
    private static generateRandomTestsWithInfo(
        func: FunctionInfo,
        count: number
    ): { code: string; cases: TestCaseInfo[] } {
        if (count <= 0 || func.parameters.length === 0) {
            return { code: '', cases: [] };
        }
        let code = `// ============================================================================\n`;
        code += `// Random Value Tests for: ${func.name}()\n`;
        code += `// ============================================================================\n\n`;
        const cases: TestCaseInfo[] = [];
        for (let i = 0; i < count; i++) {
            const testName = `Random_${i + 1}`;
            code += `TEST(${func.name}Test, ${testName}) {\n`;
            code += '    // Arrange (randomly generated values)\n';
            const paramValues: { name: string; value: string }[] = [];
            for (const param of func.parameters) {
                const value = this.randomValueForType(param.type);
                code += `    ${param.type} ${param.name} = ${value};\n`;
                paramValues.push({ name: param.name, value });
            }
            code += '\n';
            const paramNames = func.parameters.map(p => p.name);
            code += this.emitAct(func, paramNames);
            code += '\n';
            code += `    // TODO: Provide expected value\n`;
            code += `    FAIL() << "Expected value not set for random test ${i + 1}";\n`;
            code += '}\n\n';
            cases.push({
                testName,
                inputs: paramValues.map(p => `${p.name}=${p.value}`).join(', '),
                paramValues
            });
        }
        return { code, cases };
    }
    /**
     * Generate a random C literal value for a primitive type.
     * Complex types (pointers, arrays, structs) receive a safe nominal value.
     */
    private static randomValueForType(type: string): string {
        const t = type.trim().replace(/\s+/g, ' ').toLowerCase();
        if (isPointerType(type)) { return 'NULL'; }
        if (isArrayType(type))   { return '/* array */'; }
        if (isStructType(type))  { return '{0}'; }
        if (t === 'float') {
            const v = (Math.random() * 200 - 100).toFixed(4);
            return `${v}f`;
        }
        if (t === 'double') {
            return (Math.random() * 200 - 100).toFixed(6);
        }
        if (t === 'char') {
            const code = Math.floor(Math.random() * 94) + 33; // printable ASCII 33-126
            return `'${String.fromCharCode(code)}'`;
        }
        if (t === 'unsigned char' || t === 'unsigned short') {
            return String(Math.floor(Math.random() * 200));
        }
        if (t === 'unsigned int' || t === 'unsigned') {
            return String(Math.floor(Math.random() * 1000));
        }
        if (t === 'unsigned long') {
            return `${Math.floor(Math.random() * 1000)}UL`;
        }
        if (t === 'size_t') {
            return String(Math.floor(Math.random() * 100));
        }
        // int, short, long and any other integer-like type
        return String(Math.floor(Math.random() * 201) - 100);
    }
    /*
     * FunctionExtractor stores array parameters as e.g. type="int[10]", name="arr"
     * but the declaration syntax requires "int arr[10]".
     */
    private static formatParamForDecl(param: FunctionParameter): string {
        const arrayMatch = param.type.match(/^(.+?)(\s*\[.*\])$/);
        if (arrayMatch) {
            return `${arrayMatch[1].trim()} ${param.name}${arrayMatch[2].trim()}`;
        }
        return `${param.type} ${param.name}`;
    }

    private static generateFixtureClass(funcName: string, globals: GlobalVariable[]): string {
        const className = this.capitalize(funcName) + 'Fixture';

        let code = `// ============================================================================\n`;
        code += `// Test Fixture for ${funcName}() (uses global variables)\n`;
        code += `// ============================================================================\n\n`;

        code += `class ${className} : public ::testing::Test {\n`;
        code += `protected:\n`;
        code += `    // Saved global values\n`;

        for (const g of globals) {
            code += `    ${g.type} saved_${g.name};\n`;
        }

        code += `\n`;
        code += `    void SetUp() override {\n`;
        code += `        // Save original global values\n`;
        for (const g of globals) {
            code += `        saved_${g.name} = ${g.name};\n`;
        }
        code += `    }\n\n`;

        code += `    void TearDown() override {\n`;
        code += `        // Restore original global values\n`;
        for (const g of globals) {
            code += `        ${g.name} = saved_${g.name};\n`;
        }
        code += `    }\n`;
        code += `};\n\n`;

        return code;
    }

    private static getSafeValue(type: string): string {
        const cleanType = type.trim().replace(/\s+/g, ' ');
        if (cleanType.includes('unsigned'))  { return '10'; }
        if (cleanType.includes('*'))         { return 'NULL'; }
        if (cleanType.includes('['))         { return '/* array */'; }
        if (cleanType.startsWith('struct ')) { return '{0}'; }
        switch (cleanType) {
            case 'int':
            case 'long':
            case 'short':
                return '10';
            case 'float':
                return '1.0f';
            case 'double':
                return '1.0';
            case 'char':
                return "'a'";
            case 'size_t':
                return '10';
            default:
                return '1';
        }
    }

    private static getDefaultValue(type: string): string {
        const cleanType = type.trim().replace(/\s+/g, ' ');
        if (cleanType.includes('float'))  { return '0.0f'; }
        if (cleanType.includes('double')) { return '0.0'; }
        if (cleanType.includes('char'))   { return "'\\0'"; }
        return '0';
    }

    private static sanitizeLabel(label: string): string {
        return label.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    private static capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Positive finite extreme float/double boundary literals for which standard
     * math functions always produce a valid, deterministic result.
     * Used to detect `Param_x_Max`-style test cases where a stdlib oracle assertion
     * (`EXPECT_FLOAT_EQ(result, sqrtf(FLT_MAX))`) is safe and correct.
     */
    private static readonly POSITIVE_FLOAT_EXTREMES = new Set([
        'FLT_MAX', 'DBL_MAX',
        '(FLT_MAX - FLT_EPSILON)', '(DBL_MAX - DBL_EPSILON)',
    ]);
    /**
     * Map of known C math function names to their stdlib equivalents and domain
     * constraints.  Entries cover both the raw stdlib names and common wrapper
     * naming conventions (e.g. my_sqrt).
     */
    private static readonly MATH_FUNC_DOMAINS: Record<string, {
        requiresNonNegative: boolean;
        stdLibFloat: string;
        stdLibDouble: string;
    }> = {
        'my_sqrt':  { requiresNonNegative: true,  stdLibFloat: 'sqrtf',  stdLibDouble: 'sqrt'  },
        'sqrt':     { requiresNonNegative: true,  stdLibFloat: 'sqrtf',  stdLibDouble: 'sqrt'  },
        'sqrtf':    { requiresNonNegative: true,  stdLibFloat: 'sqrtf',  stdLibDouble: 'sqrt'  },
        'my_log':   { requiresNonNegative: true,  stdLibFloat: 'logf',   stdLibDouble: 'log'   },
        'my_logf':  { requiresNonNegative: true,  stdLibFloat: 'logf',   stdLibDouble: 'log'   },
        'log':      { requiresNonNegative: true,  stdLibFloat: 'logf',   stdLibDouble: 'log'   },
        'logf':     { requiresNonNegative: true,  stdLibFloat: 'logf',   stdLibDouble: 'log'   },
        'my_log2':  { requiresNonNegative: true,  stdLibFloat: 'log2f',  stdLibDouble: 'log2'  },
        'my_log2f': { requiresNonNegative: true,  stdLibFloat: 'log2f',  stdLibDouble: 'log2'  },
        'log2':     { requiresNonNegative: true,  stdLibFloat: 'log2f',  stdLibDouble: 'log2'  },
        'log2f':    { requiresNonNegative: true,  stdLibFloat: 'log2f',  stdLibDouble: 'log2'  },
        'my_log10': { requiresNonNegative: true,  stdLibFloat: 'log10f', stdLibDouble: 'log10' },
        'my_log10f':{ requiresNonNegative: true,  stdLibFloat: 'log10f', stdLibDouble: 'log10' },
        'log10':    { requiresNonNegative: true,  stdLibFloat: 'log10f', stdLibDouble: 'log10' },
        'log10f':   { requiresNonNegative: true,  stdLibFloat: 'log10f', stdLibDouble: 'log10' },
        'asin':     { requiresNonNegative: false, stdLibFloat: 'asinf',  stdLibDouble: 'asin'  },
        'asinf':    { requiresNonNegative: false, stdLibFloat: 'asinf',  stdLibDouble: 'asin'  },
        'acos':     { requiresNonNegative: false, stdLibFloat: 'acosf',  stdLibDouble: 'acos'  },
        'acosf':    { requiresNonNegative: false, stdLibFloat: 'acosf',  stdLibDouble: 'acos'  },
    };
    /**
     * Check if a return type is void (no value to capture).
     */
    private static isVoidReturn(returnType: string): boolean {
        return returnType.trim().toLowerCase() === 'void';
    }

    /**
     * Check if a return type is a floating-point type (float or double).
     */
    private static isFloatingReturn(returnType: string): boolean {
        const rt = returnType.trim().toLowerCase();
        return rt === 'float' || rt === 'double';
    }
    /**
     * Choose a variable name for the function return value that does not shadow
     * any parameter name.  Falls back through 'result' → 'actual' → 'retval'.
     */
    private static safeReturnVar(paramNames: string[]): string {
        if (!paramNames.includes('result')) { return 'result'; }
        if (!paramNames.includes('actual')) { return 'actual'; }
        return 'retval';
    }
    /**
     * Emit the Act section — calls the function, capturing result only for non-void.
     */
    private static emitAct(
        func: FunctionInfo,
        paramNames: string[]
    ): string {
        let code = '    // Act\n';
        const args = paramNames.join(', ');
        if (this.isVoidReturn(func.returnType)) {
            code += `    ${func.name}(${args});\n`;
        } else {
            const retVar = this.safeReturnVar(paramNames);
            code += `    ${func.returnType} ${retVar} = ${func.name}(${args});\n`;
        }
        return code;
    }

    /**
     * Emit the Assert section, adapting to void vs. non-void return types.
     *
     * Special handling for floating-point return types:
     * - NaN input                                          → EXPECT_TRUE(std::isnan)
     * - Negative-infinity input to a math-like function   → EXPECT_TRUE(std::isnan)
     * - Positive-infinity input, single-param math func   → EXPECT_TRUE(std::isinf && > 0)
     * - Negative finite input, single-param function      → EXPECT_TRUE(std::isnan) (domain violation)
     * - Extreme positive input, single-param known func   → EXPECT_FLOAT/DOUBLE_EQ(stdlib(input))
     * - Inf/extreme multi-param or unknown                → FAIL() + TODO placeholder
     *
     * For void functions: emits a TODO comment about asserting side effects.
     * For other non-void functions: emits FAIL() with the result value.
     * @param paramNames - the parameter names used in this test (needed to pick a
*                     non-conflicting return-value variable name).
     */
    private static emitAssert(
        func: FunctionInfo,
        set?: { testNote?: string; noAssertion?: boolean; values?: string[]; expectsOverflow?: boolean },
        paramNames: string[] = []
    ): string {
        const retVar = this.safeReturnVar(paramNames);
        const vals = set?.values ?? [];
        const hasSpecialFloatInput = vals.some(v => isFloatSpecialValue(v));
        // NaN propagates through virtually all arithmetic — a safe assertion
        // that does not require the user to supply an expected value.
        const hasNaNInput = vals.some(v => /^[+-]?\s*nan[fl]?$/i.test(v.trim()));
        let code = '    // Assert\n';
        if (set?.testNote) {
            code += `    // NOTE: ${set.testNote}\n`;
        }
        if (hasSpecialFloatInput && !hasNaNInput) {
            code += '    // Note: result may be Inf or NaN \u2014 use std::isinf() / std::isnan() for assertions\n';
        }
        if (this.isVoidReturn(func.returnType)) {
            code += '    // TODO: Assert side effects (e.g., modified pointer targets, globals)\n';
            code += `    FAIL() << "Expected side-effect assertion needed for ${func.name}()";\n`;
        } else if (set?.noAssertion) {
            code += `    (void)${retVar}; // No assertion \u2014 see note above\n`;
        } else if (hasNaNInput && this.isFloatingReturn(func.returnType)) {
            // NaN propagates through all standard arithmetic operations —
            // this assertion is universally correct without user input.
            // No TODO comment — the assertion is already valid.
            code += `    EXPECT_TRUE(std::isnan(${retVar})) << "Got: " << ${retVar};\n`;
        } else if (this.isFloatingReturn(func.returnType)) {
            code += this.emitFloatAssert(func, vals, retVar, hasSpecialFloatInput, set?.expectsOverflow ?? false);
        } else {
            code += '    // TODO: Provide expected value\n';
            code += `    FAIL() << "Expected value needed. Got: " << ${retVar};\n`;
        }
        return code;
        }
    /**
     * Emit the float/double-specific assertion body.  Called when the return type
     * is float or double and the input is not a NaN literal.
     */
    private static emitFloatAssert(
        func: FunctionInfo,
        vals: string[],
        retVar: string,
        hasSpecialFloatInput: boolean,
        expectsOverflow: boolean
    ): string {
        const isSingleParam = func.parameters.length === 1;
        const hasNegInfInput = vals.some(v => /^-\s*inf(?:inity)?[fl]?$/i.test(v.trim()));
        const hasPosInfInput = vals.some(v => /^[+]?\s*inf(?:inity)?[fl]?$/i.test(v.trim()));
        const hasNegFiniteInput = vals.some(v => isNegativeFiniteFloat(v));
        const domain = TestGenerator.MATH_FUNC_DOMAINS[func.name];
        // -INFINITY input to a known math function always produces NaN
        // (e.g. sqrt(-∞) = NaN, log(-∞) = NaN, asin(-∞) = NaN).
        // Restrict to functions in MATH_FUNC_DOMAINS to avoid false assertions for
        // functions like exp(-∞) = 0.0 that have well-defined finite results.
        if (hasNegInfInput && isSingleParam && domain) {
            return `    EXPECT_TRUE(std::isnan(${retVar})) << "Got: " << ${retVar};\n`;
        }
        // +INFINITY input to a single-param function that maps +∞ to +∞:
        // sqrt(+∞) = +∞, log(+∞) = +∞.  This only holds for functions with a
        // non-negative domain (requiresNonNegative: true).
        if (hasPosInfInput && isSingleParam && domain?.requiresNonNegative) {
            return `    EXPECT_TRUE(std::isinf(${retVar}) && ${retVar} > 0) << "Got: " << ${retVar};\n`;
        }
        // +INFINITY to a bounded-domain function (asin, acos) is also NaN since
        // +∞ lies outside the domain [-1, 1].
        if (hasPosInfInput && isSingleParam && domain && !domain.requiresNonNegative) {
            return `    EXPECT_TRUE(std::isnan(${retVar})) << "Got: " << ${retVar};\n`;
        }
        // Negative finite input to a single-param float function is a likely
        // domain violation (e.g. sqrt(-x) = NaN per IEEE 754).
        if (hasNegFiniteInput && isSingleParam) {
            return '    // Likely a domain violation (negative input); result should be NaN per IEEE 754\n' +
                   `    EXPECT_TRUE(std::isnan(${retVar})) << "Got: " << ${retVar};\n`;
        }
        // Extreme positive input to a single-param known math function with a
        // non-negative domain: use the corresponding stdlib function as the oracle.
        // (e.g. sqrtf(FLT_MAX) is a perfectly valid finite number.)
        // Gate behind requiresNonNegative to avoid cases where extreme positive
        // inputs are also outside the function's domain (e.g. asin(FLT_MAX) = NaN).
        const hasPositiveExtreme = vals.some(v => TestGenerator.POSITIVE_FLOAT_EXTREMES.has(v.trim()));
        if ((hasPositiveExtreme || expectsOverflow) && isSingleParam && domain?.requiresNonNegative) {
            const stdLib = func.returnType.trim().toLowerCase() === 'float'
                ? domain.stdLibFloat : domain.stdLibDouble;
            const inputVal = vals[0];
            if (inputVal) {
                const eqMacro = func.returnType.trim().toLowerCase() === 'float'
                    ? 'EXPECT_FLOAT_EQ' : 'EXPECT_DOUBLE_EQ';
                return `    ${eqMacro}(${retVar}, ${stdLib}(${inputVal}));\n`;
            }
        }
        // Normal input to a known single-param math function: use the stdlib
        // function as an oracle so the test passes automatically.
        // E.g. my_log(0.0f) → EXPECT_FLOAT_EQ(result, logf(0.0f))
        // This covers the Baseline_AllZero test and any other nominal input.
        if (isSingleParam && domain) {
            const stdLib = func.returnType.trim().toLowerCase() === 'float'
                ? domain.stdLibFloat : domain.stdLibDouble;
            const inputVal = vals[0];
            if (inputVal) {
                const eqMacro = func.returnType.trim().toLowerCase() === 'float'
                    ? 'EXPECT_FLOAT_EQ' : 'EXPECT_DOUBLE_EQ';
                return `    ${eqMacro}(${retVar}, ${stdLib}(${inputVal}));\n`;
            }
        }
        // Multi-param overflow: when all float/double params are at extremes
        // (e.g. add(FLT_MAX, FLT_MAX) → Inf), the result is often ±Inf or NaN.
        // However, some operations produce finite results (e.g. divide(FLT_MAX,
        // FLT_MAX) = 1.0).  Emit a permissive assertion that passes for overflow
        // cases, and include a TODO comment so the webview can detect and offer
        // replacement when the result is actually finite.
        if (expectsOverflow) {
            return '    // TODO: Provide expected value\n' +
                   `    EXPECT_TRUE(std::isnan(${retVar}) || std::isinf(${retVar})) << "Got: " << ${retVar};\n`;
        }
        // Other Inf/extreme case: the actual result depends on function
        // semantics (e.g. divide(FLT_MAX, 1.0f) = FLT_MAX,
        // divide(1.0f, INFINITY) = 0).  Emit a placeholder for the user.
        if (hasSpecialFloatInput) {
            return '    // TODO: Provide expected value (Inf / extreme inputs \u2014 result depends on function semantics)\n' +
                   `    FAIL() << "Expected value needed. Got: " << ${retVar};\n`;
        }
        return '    // TODO: Provide expected value\n' +
               `    FAIL() << "Expected value needed. Got: " << ${retVar};\n`;
    }
}