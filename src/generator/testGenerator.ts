import { FunctionInfo } from '../types';
import { generateBoundarySets, BoundarySet } from './boundaryValues';
import * as path from 'path';

export class TestGenerator {
    /**
     * Generate Google Test code for a list of functions with boundary value analysis
     */
    static generateTests(functions: FunctionInfo[], sourceFileName: string): string {
        if (functions.length === 0) {
            return this.generateEmptyTestFile(sourceFileName);
        }

        const testCode: string[] = [];
        
        // Collect all required headers across all functions
        const requiredHeaders = this.collectRequiredHeaders(functions);
        
        // Add includes
        testCode.push('#include <gtest/gtest.h>');
        
        // Add required system headers (limits.h, float.h) if needed
        if (requiredHeaders.length > 0) {
            requiredHeaders.forEach(header => {
                testCode.push(`#include <${header}>`);
            });
        }
        
        testCode.push('');
        
        // Add source file include with extern "C" wrapper for C/C++ compatibility
        testCode.push('extern "C" {');
        testCode.push(`    #include "${sourceFileName}"`);
        testCode.push('}');
        testCode.push('');
        
        // Add header comment
        testCode.push('// ============================================================================');
        testCode.push('// Generated Test Cases with Boundary Value Analysis');
        testCode.push('// ============================================================================');
        testCode.push('');

        // Generate tests for each function
        for (const func of functions) {
            const functionTests = this.generateTestsForFunction(func);
            testCode.push(...functionTests);
            testCode.push('');
        }

        return testCode.join('\n');
    }

    /**
     * Collect all required headers (limits.h, float.h) from all functions
     */
    private static collectRequiredHeaders(functions: FunctionInfo[]): string[] {
        const headers = new Set<string>();
        
        for (const func of functions) {
            const boundarySets = generateBoundarySets(func.parameters);
            for (const set of boundarySets) {
                set.requiredHeaders.forEach(h => headers.add(h));
            }
        }
        
        return Array.from(headers);
    }

    /**
     * Generate all test cases for a single function (one per boundary set)
     */
    private static generateTestsForFunction(func: FunctionInfo): string[] {
        const boundarySets = generateBoundarySets(func.parameters);
        const tests: string[] = [];
        
        for (const boundarySet of boundarySets) {
            tests.push(this.generateSingleTest(func, boundarySet));
        }
        
        return tests;
    }

    /**
     * Generate a single TEST() block for a specific boundary set
     */
    private static generateSingleTest(func: FunctionInfo, boundarySet: BoundarySet): string {
        const testName = `${func.name}Test`;
        const caseName = boundarySet.name;
        const lines: string[] = [];

        // Add test description comment
        lines.push(`// ${boundarySet.description}`);
        lines.push(`TEST(${testName}, ${caseName}) {`);
        
        // Arrange section - declare and initialize parameters
        if (func.parameters.length > 0) {
            lines.push('    // Arrange');
            for (const param of func.parameters) {
                const value = boundarySet.values.get(param.name) || '/* TODO: initialize */';
                lines.push(`    ${param.type} ${param.name} = ${value};`);
            }
            lines.push('');
        }

        // Act section - call the function
        lines.push('    // Act');
        const paramNames = func.parameters.map(p => p.name).join(', ');
        
        if (func.returnType !== 'void') {
            lines.push(`    ${func.returnType} result = ${func.name}(${paramNames});`);
        } else {
            lines.push(`    ${func.name}(${paramNames});`);
        }
        
        lines.push('');

        // Assert section - add intelligent assertions
        lines.push('    // Assert');
        const assertion = this.generateAssertion(func, boundarySet);
        lines.push(assertion);

        lines.push('}');

        return lines.join('\n');
    }

    /**
     * Generate appropriate assertion based on function and boundary set
     */
    private static generateAssertion(func: FunctionInfo, boundarySet: BoundarySet): string {
        // Void functions - no return value to assert
        if (func.returnType === 'void') {
            return '    // No return value to assert (void function)';
        }

        // Special handling for zero values in arithmetic functions
        if (boundarySet.name === 'ZeroValues' && this.isSimpleArithmetic(func.name)) {
            // Addition/sum: 0 + 0 = 0
            if (func.name.toLowerCase().includes('add') || 
                func.name.toLowerCase().includes('sum')) {
                return '    EXPECT_EQ(result, 0);  // Sum of zeros should be zero';
            }
            
            // Multiplication/product: 0 * anything = 0
            if (func.name.toLowerCase().includes('mult') || 
                func.name.toLowerCase().includes('prod')) {
                return '    EXPECT_EQ(result, 0);  // Product with zero should be zero';
            }
            
            // Subtraction: 0 - 0 = 0
            if (func.name.toLowerCase().includes('sub')) {
                return '    EXPECT_EQ(result, 0);  // Difference of zeros should be zero';
            }
        }

        // For near-zero values in addition (e.g., 1 + -1 = 0)
        if (boundarySet.name === 'NearZeroValues' && 
            (func.name.toLowerCase().includes('add') || func.name.toLowerCase().includes('sum'))) {
            // Check if we have 1 and -1 (common near-zero case)
            const values = Array.from(boundarySet.values.values());
            if (values.includes('1') && values.includes('-1')) {
                return '    EXPECT_EQ(result, 0);  // 1 + (-1) should equal 0';
            }
        }

        // Random values - provide TODO for user to fill in expected value
        if (boundarySet.name === 'RandomValues') {
            return '    // TODO: Verify result against expected value\n' +
                   '    // EXPECT_EQ(result, expected_value);';
        }

        // Boundary cases (min/max) - may overflow, so just capture result
        return '    // Result captured for manual verification\n' +
               '    // Note: This boundary case may cause overflow/underflow\n' +
               '    // EXPECT_EQ(result, expected_value);';
    }

    /**
     * Simple heuristic to detect arithmetic function names
     */
    private static isSimpleArithmetic(name: string): boolean {
        const arithmeticPatterns = [
            'add', 'sum', 'plus',
            'mult', 'multiply', 'prod', 'product',
            'div', 'divide',
            'sub', 'subtract', 'minus'
        ];
        const lower = name.toLowerCase();
        return arithmeticPatterns.some(pattern => lower.includes(pattern));
    }

    /**
     * Generate an empty test file when no functions are found
     */
    private static generateEmptyTestFile(sourceFileName: string): string {
        const lines: string[] = [];
        
        lines.push('#include <gtest/gtest.h>');
        lines.push('');
        lines.push('extern "C" {');
        lines.push(`    #include "${sourceFileName}"`);
        lines.push('}');
        lines.push('');
        lines.push('// No functions found in source file.');
        lines.push('// Add a placeholder test to ensure the file compiles.');
        lines.push('');
        lines.push('TEST(PlaceholderTest, Placeholder) {');
        lines.push('    EXPECT_TRUE(true);');
        lines.push('}');
        
        return lines.join('\n');
    }

    /**
     * Format function parameters for display
     */
    private static formatParameters(parameters: any[]): string {
        if (parameters.length === 0) return 'void';
        return parameters.map(p => `${p.type} ${p.name}`).join(', ');
    }
}