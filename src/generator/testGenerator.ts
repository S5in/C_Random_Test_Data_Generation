import { FunctionInfo } from '../types';

export class TestGenerator {
    /**
     * Generate Google Test code for a list of functions
     */
    static generateTests(functions: FunctionInfo[], sourceFileName: string): string {
        const testCode: string[] = [];
        
        // Add includes
        testCode.push('#include <gtest/gtest.h>');
        testCode.push(`#include "${sourceFileName}"`);
        testCode.push('');

        // Generate a test for each function
        for (const func of functions) {
            testCode.push(this.generateTestForFunction(func));
            testCode.push('');
        }

        return testCode.join('\n');
    }

    /**
     * Generate a single test case for a function
     */
    private static generateTestForFunction(func: FunctionInfo): string {
        const testName = `${func.name}Test`;
        const lines: string[] = [];

        lines.push(`TEST(${testName}, BasicTest) {`);
        lines.push(`    // TODO: Implement test for ${func.name}`);
        lines.push(`    // Function signature: ${func.returnType} ${func.name}(${this.formatParameters(func.parameters)})`);
        
        if (func.parameters.length > 0) {
            lines.push('');
            lines.push('    // Arrange');
            for (const param of func.parameters) {
                lines.push(`    ${param.type} ${param.name} = /* TODO: initialize */;`);
            }
        }

        lines.push('');
        lines.push('    // Act');
        const paramNames = func.parameters.map(p => p.name).join(', ');
        if (func.returnType !== 'void') {
            lines.push(`    ${func.returnType} result = ${func.name}(${paramNames});`);
            lines.push('');
            lines.push('    // Assert');
            lines.push('    // EXPECT_EQ(result, expected_value);');
        } else {
            lines.push(`    ${func.name}(${paramNames});`);
            lines.push('');
            lines.push('    // Assert');
            lines.push('    // Add assertions here');
        }

        lines.push('}');

        return lines.join('\n');
    }

    private static formatParameters(parameters: any[]): string {
        if (parameters.length === 0) return 'void';
        return parameters.map(p => `${p.type} ${p.name}`).join(', ');
    }
}
