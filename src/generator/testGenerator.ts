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
import { generateBoundarySets, getBoundariesForType, TestDensity, isPointerType, isArrayType, isStructType, detectArraySizePairs, getBoundaryValues, isFloatSpecialValue } from './boundaryValues';

export interface TestCaseInfo {
    testName: string;
    inputs: string;
    paramValues: { name: string; value: string }[];
    globalValues?: { name: string; value: string }[];
}

export class TestGenerator {

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Generate tests AND return test case information.
     */
    static generateTestsWithCaseInfo(
        func: FunctionInfo,
        sourceFileName: string,
        usedGlobals: GlobalVariable[],
        density: TestDensity = 'standard',
        funcStructDefs: StructInfo[] = []
    ): { testCode: string; testCases: TestCaseInfo[] } {

        const testCases: TestCaseInfo[] = [];
        let testCode = this.generateHeader(sourceFileName, func, funcStructDefs, usedGlobals);

        if (usedGlobals.length > 0) {
            const result = this.generateFixtureTestsWithInfo(func, usedGlobals, density);
            testCode += result.code;
            testCases.push(...result.cases);
        } else {
            const result = this.generateRegularTestsWithInfo(func, density);
            testCode += result.code;
            testCases.push(...result.cases);
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
        density: TestDensity
    ): { code: string; cases: TestCaseInfo[] } {
        let code = `// ============================================================================\n`;
        code += `// Tests for: ${func.name}()\n`;
        code += `// ============================================================================\n\n`;

        const cases: TestCaseInfo[] = [];
        const boundarySets = generateBoundarySets(func.parameters, density);

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
        density: TestDensity
    ): { code: string; cases: TestCaseInfo[] } {
        // Static globals have internal linkage — they cannot be referenced from a
        // C++ translation unit (no `extern` declaration is valid for them).  Only
        // non-static globals can be saved/restored by the fixture and referenced in
        // the generated test bodies.
        const accessibleGlobals = globals.filter(g => !g.isStatic);
        // When every used global is static (none are accessible from C++), fall
        // back to regular test generation so the output compiles cleanly.
        if (accessibleGlobals.length === 0) {
            return this.generateRegularTestsWithInfo(func, density);
        }
        const cases: TestCaseInfo[] = [];

        let code = this.generateFixtureClass(func.name, accessibleGlobals);

        const paramResult = this.generateParameterBoundaryTestsWithInfo(func, accessibleGlobals, density);
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
        density: TestDensity
    ): { code: string; cases: TestCaseInfo[] } {
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// Parameter Boundary Tests\n\n';
        const cases: TestCaseInfo[] = [];

        const boundarySets = generateBoundarySets(func.parameters, density);

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
            // values could cause overflow.
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
        usedGlobals: GlobalVariable[] = []
    ): string {
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
     * Format a function parameter for use in a C forward declaration.
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
     * For void functions: emits a TODO comment about asserting side effects.
     * For non-void float/double functions with special float inputs: emits
     *   EXPECT_TRUE(isnan || isinf) since equality macros fail for NaN/Inf.
     * For non-void float/double functions with overflow risk: emits
     *   EXPECT_TRUE(isnan || isinf) since extreme values often overflow.
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
        const hasSpecialFloatInput = set?.values?.some(v => isFloatSpecialValue(v)) ?? false;
        let code = '    // Assert\n';
        if (set?.testNote) {
            code += `    // NOTE: ${set.testNote}\n`;
        }
        if (hasSpecialFloatInput) {
            code += '    // Note: result may be Inf or NaN \u2014 use std::isinf() / std::isnan() for assertions\n';
        }
        if (this.isVoidReturn(func.returnType)) {
            code += '    // TODO: Assert side effects (e.g., modified pointer targets, globals)\n';
            code += `    FAIL() << "Expected side-effect assertion needed for ${func.name}()";\n`;
        } else if (set?.noAssertion) {
            code += `    (void)${retVar}; // No assertion \u2014 see note above\n`;
        } else if ((hasSpecialFloatInput || set?.expectsOverflow) && this.isFloatingReturn(func.returnType)) {
            // When inputs include NaN / Inf, or extreme boundary values that
            // may overflow, and the return type is floating-point, the result
            // is most likely NaN or Inf and cannot be compared with
            // EXPECT_FLOAT_EQ / EXPECT_DOUBLE_EQ (IEEE 754: NaN != NaN).
            // No TODO comment — the assertion below is already valid.
            code += `    EXPECT_TRUE(std::isnan(${retVar}) || std::isinf(${retVar})) << "Got: " << ${retVar};\n`;
        } else {
            code += '    // TODO: Provide expected value\n';
            code += `    FAIL() << "Expected value needed. Got: " << ${retVar};\n`;
        }
        return code;
    }
}