/**
 * Test Generator
 * 
 * Generates Google Test code for C functions
 * NO BEHAVIOR GUESSING - All expected values must be provided by developer
 */

import { FunctionInfo, GlobalVariable } from '../types';
import { generateBoundarySets, getBoundariesForType } from './boundaryValues';

export interface TestCaseInfo {
    testName: string;
    inputs: string;
    paramValues: { name: string; value: string }[];
    globalValues?: { name: string; value: string }[];
}

export class TestGenerator {
    /**
     * Generate tests AND return test case information
     */
    static generateTestsWithCaseInfo(
        func: FunctionInfo,
        sourceFileName: string,
        usedGlobals: GlobalVariable[]
    ): { testCode: string; testCases: TestCaseInfo[] } {

        const testCases: TestCaseInfo[] = [];
        let testCode = this.generateHeader(sourceFileName);

        if (usedGlobals.length > 0) {
            const result = this.generateFixtureTestsWithInfo(func, usedGlobals);
            testCode += result.code;
            testCases.push(...result.cases);
        } else {
            const result = this.generateRegularTestsWithInfo(func);
            testCode += result.code;
            testCases.push(...result.cases);
        }

        return { testCode, testCases };
    }

    /**
     * Generate regular tests AND collect info in the same loop
     */
    private static generateRegularTestsWithInfo(func: FunctionInfo): {
        code: string;
        cases: TestCaseInfo[];
    } {
        let code = `// ============================================================================\n`;
        code += `// Tests for: ${func.name}()\n`;
        code += `// ============================================================================\n\n`;

        const cases: TestCaseInfo[] = [];
        const boundarySets = generateBoundarySets(func.parameters);

        for (const set of boundarySets) {
            const testName = this.sanitizeLabel(set.label);

            code += `TEST(${func.name}Test, ${testName}) {\n`;

            if (func.parameters.length === 0) {
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}();\n`;
                code += '\n';
                code += '    // Assert\n';
                code += '    // TODO: Provide expected value\n';
                code += '    FAIL() << "Expected value needed. Got: " << result;\n';
            } else {
                code += '    // Arrange\n';
                for (let i = 0; i < func.parameters.length; i++) {
                    const param = func.parameters[i];
                    const value = set.values[i];
                    code += `    ${param.type} ${param.name} = ${value};\n`;
                }

                code += '\n';
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}(`;
                code += func.parameters.map(p => p.name).join(', ');
                code += ');\n';

                code += '\n';
                code += '    // Assert\n';
                code += '    // TODO: Provide expected value\n';
                code += '    FAIL() << "Expected value needed. Got: " << result;\n';
            }

            code += '}\n\n';

            // Collect test case info
            const paramValues: { name: string; value: string }[] = [];
            for (let i = 0; i < func.parameters.length; i++) {
                paramValues.push({
                    name: func.parameters[i].name,
                    value: set.values[i]
                });
            }

            cases.push({
                testName,
                inputs: paramValues.map(p => `${p.name}=${p.value}`).join(', '),
                paramValues
            });
        }

        return { code, cases };
    }

    /**
     * Generate fixture tests AND collect info
     */
    private static generateFixtureTestsWithInfo(
        func: FunctionInfo,
        globals: GlobalVariable[]
    ): {
        code: string;
        cases: TestCaseInfo[];
    } {
        const cases: TestCaseInfo[] = [];

        // This calls the private generateFixtureClass method below
        let code = this.generateFixtureClass(func.name, globals);

        const paramResult = this.generateParameterBoundaryTestsWithInfo(func, globals);
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
        globals: GlobalVariable[]
    ): {
        code: string;
        cases: TestCaseInfo[];
    } {
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// Parameter Boundary Tests\n\n';
        const cases: TestCaseInfo[] = [];

        const boundarySets = generateBoundarySets(func.parameters);

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
                    const param = func.parameters[i];
                    const value = set.values[i];
                    code += `    ${param.type} ${param.name} = ${value};\n`;
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
            code += '    FAIL() << "Expected value needed. Got: " << result;\n';
            code += '}\n\n';

            const paramValues: { name: string; value: string }[] = [];
            const globalValues: { name: string; value: string }[] = [];

            for (let i = 0; i < func.parameters.length; i++) {
                paramValues.push({
                    name: func.parameters[i].name,
                    value: set.values[i]
                });
            }
            for (const global of globals) {
                globalValues.push({
                    name: global.name,
                    value: global.initialValue || '0'
                });
            }

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
    ): {
        code: string;
        cases: TestCaseInfo[];
    } {
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
                        const safeValue = this.getSafeValue(param.type);
                        code += `    ${param.type} ${param.name} = ${safeValue};\n`;
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
                code += '    FAIL() << "Expected value needed. Got: " << result;\n';
                code += '}\n\n';

                const paramValues: { name: string; value: string }[] = [];
                const globalValues: { name: string; value: string }[] = [];

                for (const param of func.parameters) {
                    paramValues.push({
                        name: param.name,
                        value: this.getSafeValue(param.type)
                    });
                }

                globalValues.push({ name: global.name, value: boundary.literal });
                for (const otherGlobal of globals) {
                    if (otherGlobal.name !== global.name) {
                        globalValues.push({
                            name: otherGlobal.name,
                            value: otherGlobal.initialValue || '0'
                        });
                    }
                }

                cases.push({
                    testName,
                    inputs: paramValues.map(p => `${p.name}=${p.value}`).join(', '),
                    paramValues,
                    globalValues
                });
            }
        }

        return { code, cases };
    }

    private static generateCombinationTestsWithInfo(
        func: FunctionInfo,
        globals: GlobalVariable[]
    ): {
        code: string;
        cases: TestCaseInfo[];
    } {
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// Combination Tests\n\n';
        const cases: TestCaseInfo[] = [];

        // Test 1: All minimums
        code += `TEST_F(${className}, Combination_AllMinimums) {\n`;
        for (const global of globals) {
            const boundaries = getBoundariesForType(global.type);
            const minBoundary = boundaries.find(b => b.label === 'minimum');
            if (minBoundary) {
                code += `    ${global.name} = ${minBoundary.literal};\n`;
            }
        }
        if (func.parameters.length > 0) {
            code += '\n';
            for (const param of func.parameters) {
                const boundaries = getBoundariesForType(param.type);
                const minBoundary = boundaries.find(b => b.label === 'minimum');
                if (minBoundary) {
                    code += `    ${param.type} ${param.name} = ${minBoundary.literal};\n`;
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
        code += '    FAIL() << "Expected value needed. Got: " << result;\n';
        code += '}\n\n';
        cases.push({
            testName: 'Combination_AllMinimums',
            inputs: 'All inputs at minimum values',
            paramValues: [],
            globalValues: []
        });

        // Test 2: All maximums
        code += `TEST_F(${className}, Combination_AllMaximums) {\n`;
        for (const global of globals) {
            const boundaries = getBoundariesForType(global.type);
            const maxBoundary = boundaries.find(b => b.label === 'maximum');
            if (maxBoundary) {
                code += `    ${global.name} = ${maxBoundary.literal};\n`;
            }
        }
        if (func.parameters.length > 0) {
            code += '\n';
            for (const param of func.parameters) {
                const boundaries = getBoundariesForType(param.type);
                const maxBoundary = boundaries.find(b => b.label === 'maximum');
                if (maxBoundary) {
                    code += `    ${param.type} ${param.name} = ${maxBoundary.literal};\n`;
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
        code += '    FAIL() << "Expected value needed. Got: " << result;\n';
        code += '}\n\n';
        cases.push({
            testName: 'Combination_AllMaximums',
            inputs: 'All inputs at maximum values',
            paramValues: [],
            globalValues: []
        });

        // Test 3: Mixed
        if (func.parameters.length > 0 && globals.length > 0) {
            code += `TEST_F(${className}, Combination_ParamMin_GlobalMax) {\n`;
            for (const global of globals) {
                const boundaries = getBoundariesForType(global.type);
                const maxBoundary = boundaries.find(b => b.label === 'maximum');
                if (maxBoundary) {
                    code += `    ${global.name} = ${maxBoundary.literal};\n`;
                }
            }
            code += '\n';
            for (const param of func.parameters) {
                const boundaries = getBoundariesForType(param.type);
                const minBoundary = boundaries.find(b => b.label === 'minimum');
                if (minBoundary) {
                    code += `    ${param.type} ${param.name} = ${minBoundary.literal};\n`;
                }
            }
            code += '\n';
            code += `    ${func.returnType} result = ${func.name}(`;
            code += func.parameters.map(p => p.name).join(', ');
            code += ');\n\n';
            code += '    // TODO: Provide expected value\n';
            code += '    FAIL() << "Expected value needed. Got: " << result;\n';
            code += '}\n\n';
            cases.push({
                testName: 'Combination_ParamMin_GlobalMax',
                inputs: 'Parameters at min, globals at max',
                paramValues: [],
                globalValues: []
            });
        }

        return { code, cases };
    }

    /**
     * @deprecated Use generateTestsWithCaseInfo instead
     */
    static generateTestsForFunction(
        func: FunctionInfo,
        sourceFileName: string,
        usedGlobals: GlobalVariable[]
    ): string {
        const result = this.generateTestsWithCaseInfo(func, sourceFileName, usedGlobals);
        return result.testCode;
    }

    // ========================================================================
    // Private helper methods (shared by all generation paths)
    // ========================================================================

    private static generateHeader(sourceFileName: string): string {
        return `// ============================================================================
// Generated Tests for ${sourceFileName}
// AUTO-GENERATED by C Test Generator
// ============================================================================

#include <gtest/gtest.h>
#include <climits>
#include <cfloat>

extern "C" {
    #include "${sourceFileName}"
}

`;
    }

    private static generateFixtureClass(
        funcName: string,
        globals: GlobalVariable[]
    ): string {
        
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
        if (cleanType.includes('unsigned')) return '10';
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
            default:
                return '1';
        }
    }

    private static getDefaultValue(type: string): string {
        const cleanType = type.trim().replace(/\s+/g, ' ');
        switch (cleanType) {
            case 'int':
            case 'long':
            case 'short':
            case 'unsigned int':
            case 'unsigned long':
            case 'unsigned short':
                return '0';
            case 'float':
                return '0.0f';
            case 'double':
                return '0.0';
            case 'char':
                return "'\\0'";
            default:
                return '0';
        }
    }

    private static sanitizeLabel(label: string): string {
        return label.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    private static capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}