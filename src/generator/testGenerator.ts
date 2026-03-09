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

import { FunctionInfo, GlobalVariable } from '../types';
import { generateBoundarySets, getBoundariesForType, TestDensity, isPointerType, isArrayType, isStructType } from './boundaryValues';

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
        density: TestDensity = 'standard'
    ): { testCode: string; testCases: TestCaseInfo[] } {

        const testCases: TestCaseInfo[] = [];
        let testCode = this.generateHeader(sourceFileName);

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
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}();\n`;
                code += '\n';
                code += '    // Assert\n';
                code += '    // TODO: Provide expected value\n';
                code += `    FAIL() << "Expected value needed. Got: " << result;\n`;
            } else {
                code += '    // Arrange\n';
                for (let i = 0; i < func.parameters.length; i++) {
                    code += this.buildParamDeclaration(func.parameters[i], set, i);
                }

                code += '\n';
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}(`;
                code += func.parameters.map(p => p.name).join(', ');
                code += ');\n';

                code += '\n';
                code += '    // Assert\n';
                code += '    // TODO: Provide expected value\n';
                code += `    FAIL() << "Expected value needed. Got: " << result;\n`;
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
        const cases: TestCaseInfo[] = [];

        let code = this.generateFixtureClass(func.name, globals);

        const paramResult = this.generateParameterBoundaryTestsWithInfo(func, globals, density);
        code += paramResult.code;
        cases.push(...paramResult.cases);

        const globalResult = this.generateGlobalBoundaryTestsWithInfo(func, globals);
        code += globalResult.code;
        cases.push(...globalResult.cases);

        const comboResult = this.generateCombinationTestsWithInfo(func, globals);
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
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}();\n`;
            } else {
                code += '    // Arrange\n';
                for (let i = 0; i < func.parameters.length; i++) {
                    code += this.buildParamDeclaration(func.parameters[i], set, i);
                }
                code += '\n';
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}(`;
                code += func.parameters.map(p => p.name).join(', ');
                code += ');\n';
            }

            code += '\n';
            code += '    // Assert\n';
            code += '    // TODO: Provide expected value\n';
            code += `    FAIL() << "Expected value needed. Got: " << result;\n`;
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
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}(`;
                if (func.parameters.length > 0) {
                    code += func.parameters.map(p => p.name).join(', ');
                }
                code += ');\n';

                code += '\n';
                code += '    // Assert\n';
                code += '    // TODO: Provide expected value\n';
                code += `    FAIL() << "Expected value needed. Got: " << result;\n`;
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
            if (func.parameters.length > 0) {
                code += '\n';
                for (const param of func.parameters) {
                    if (isPointerType(param.type) || isArrayType(param.type) || isStructType(param.type)) {
                        code += this.buildSafeParamDeclaration(param);
                    } else {
                        const boundaries = getBoundariesForType(param.type);
                        const bv = boundaries.find(b => b.label === paramBoundaryLabel);
                        if (bv) {
                            code += `    ${param.type} ${param.name} = ${bv.literal};\n`;
                        } else {
                            code += this.buildSafeParamDeclaration(param);
                        }
                    }
                }
            }
            code += '\n';
            code += `    ${func.returnType} result = ${func.name}(`;
            if (func.parameters.length > 0) {
                code += func.parameters.map(p => p.name).join(', ');
            }
            code += ');\n\n';
            code += '    // TODO: Provide expected value\n';
            code += `    FAIL() << "Expected value needed. Got: " << result;\n`;
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
            result += `    ${param.type} ${param.name} = ${value};\n`;
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

    private static generateHeader(sourceFileName: string): string {
        return `// ============================================================================
// Generated Tests for ${sourceFileName}
// AUTO-GENERATED by C Test Generator v2.0.0
// ============================================================================

#include <gtest/gtest.h>
#include <climits>
#include <cfloat>
#include <cstddef>
#include <limits>

extern "C" {
    #include "${sourceFileName}"
}

`;
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
}
