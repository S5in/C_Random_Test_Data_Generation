import { FunctionInfo, GlobalVariable } from '../types';
import { generateBoundarySets, BoundarySet, getBoundariesForType } from './boundaryValues';
import * as path from 'path';

export class TestGenerator {
    /**
     * Generate tests for all functions (UPDATED to support globals)
     */
    static generateTests(
        functions: FunctionInfo[],
        sourceFileName: string,
        globals?: GlobalVariable[],
        globalUsage?: Map<string, GlobalVariable[]>
    ): string {
        
        let code = this.generateHeader(sourceFileName);

        for (const func of functions) {
            const usedGlobals = globalUsage?.get(func.name) || [];
            
            if (usedGlobals.length > 0) {
                // Function uses globals → generate fixture-based tests
                code += this.generateFixtureTests(func, usedGlobals);
            } else {
                // No globals → generate regular tests
                code += this.generateRegularTests(func);
            }
        }

        return code;
    }

    /**
     * Generate header section with includes
     */
    private static generateHeader(sourceFileName: string): string {
        let code = '#include <gtest/gtest.h>\n';
        code += '#include <limits.h>\n';
        code += '#include <float.h>\n';
        code += '\n';
        code += 'extern "C" {\n';
        code += `    #include "${sourceFileName}"\n`;
        code += '}\n';
        code += '\n';
        code += '// ============================================================================\n';
        code += '// Generated Test Cases with Boundary Value Analysis\n';
        code += '// ============================================================================\n';
        code += '\n';
        
        return code;
    }

    /**
     * Generate fixture class for functions with globals
     */
    private static generateFixtureClass(
        funcName: string,
        globals: GlobalVariable[]
    ): string {
        
        const className = this.capitalize(funcName) + 'Fixture';

        let code = `// ============================================================================\n`;
        code += `// Test Fixture for ${funcName} (uses global variables)\n`;
        code += `// ============================================================================\n\n`;
        
        code += `class ${className} : public ::testing::Test {\n`;
        code += `protected:\n`;
        code += `    // Saved global values (for restoration in TearDown)\n`;
        
        for (const g of globals) {
            code += `    ${g.type} saved_${g.name};\n`;
        }
        
        code += `\n`;
        code += `    void SetUp() override {\n`;
        code += `        // Save original global values before each test\n`;
        
        for (const g of globals) {
            code += `        saved_${g.name} = ${g.name};\n`;
        }
        
        code += `    }\n\n`;
        code += `    void TearDown() override {\n`;
        code += `        // Restore original global values after each test\n`;
        
        for (const g of globals) {
            code += `        ${g.name} = saved_${g.name};\n`;
        }
        
        code += `    }\n`;
        code += `};\n\n`;

        return code;
    }

    /**
     * Generate fixture-based tests (for functions with globals)
     */
    private static generateFixtureTests(
        func: FunctionInfo,
        globals: GlobalVariable[]
    ): string {
        
        let code = this.generateFixtureClass(func.name, globals);

        // Part 1: Parameter boundary tests (globals at default)
        code += this.generateParameterBoundaryTests(func, globals);

        // Part 2: Global boundary tests (parameters at safe values)
        code += this.generateGlobalBoundaryTests(func, globals);

        // Part 3: Critical combination tests
        code += this.generateCombinationTests(func, globals);

        return code;
    }

    /**
     * Generate parameter boundary tests (globals at default values)
     */
    private static generateParameterBoundaryTests(
        func: FunctionInfo,
        globals: GlobalVariable[]
    ): string {
        
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// ========================================\n';
        code += '// Parameter Boundary Tests (globals at default)\n';
        code += '// ========================================\n\n';

        const boundarySets = generateBoundarySets(func.parameters);

        for (const set of boundarySets) {
            const testName = `TEST_F(${className}, Param_${this.sanitizeLabel(set.name)})`;

            code += `${testName} {\n`;

            // Set globals to their initial values
            code += '    // Set globals to default values\n';
            for (const global of globals) {
                const defaultValue = global.initialValue || this.getDefaultValue(global.type);
                code += `    ${global.name} = ${defaultValue};\n`;
            }

            code += '\n';

            // Handle functions with no parameters
            if (func.parameters.length === 0) {
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}();\n`;
                code += '\n';
                code += '    // Assert\n';
                code += '    // TODO: Verify result against expected value\n';
            } else {
                code += '    // Set parameters to boundary values\n';

                // Declare and initialize parameters
                for (const param of func.parameters) {
                    const value = set.values.get(param.name) || '0';
                    code += `    ${param.type} ${param.name} = ${value};\n`;
                }

                // Call function
                code += '\n';
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}(`;
                code += func.parameters.map(p => p.name).join(', ');
                code += ');\n';

                code += '\n';
                code += '    // Assert\n';
                
                // Try to generate intelligent assertion
                const allValues = Array.from(set.values.values());
                if (this.isAllZero(allValues)) {
                    const assertion = this.generateZeroAssertion(func);
                    if (assertion) {
                        code += `    ${assertion}\n`;
                    } else {
                        code += '    // TODO: Verify result against expected value\n';
                    }
                } else {
                    code += '    // TODO: Verify result against expected value\n';
                    code += `    // Note: Testing with boundary set (${set.name})\n`;
                }
            }

            code += '}\n\n';
        }

        return code;
    }

    /**
     * Generate global boundary tests (parameters at safe values)
     */
    private static generateGlobalBoundaryTests(
        func: FunctionInfo,
        globals: GlobalVariable[]
    ): string {
        
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// ========================================\n';
        code += '// Global Variable Boundary Tests\n';
        code += '// ========================================\n\n';

        for (const global of globals) {
            const globalBoundaries = getBoundariesForType(global.type);

            for (const boundary of globalBoundaries) {
                const testName = `TEST_F(${className}, Global_${global.name}_${this.sanitizeLabel(boundary.label)})`;

                code += `${testName} {\n`;

                // Set THIS global to boundary value
                code += `    // Set ${global.name} to boundary: ${boundary.label}\n`;
                code += `    ${global.name} = ${boundary.literal};\n`;

                // Set OTHER globals to defaults
                if (globals.length > 1) {
                    code += '\n';
                    code += '    // Set other globals to default\n';
                    for (const otherGlobal of globals) {
                        if (otherGlobal.name !== global.name) {
                            const defaultValue = otherGlobal.initialValue || this.getDefaultValue(otherGlobal.type);
                            code += `    ${otherGlobal.name} = ${defaultValue};\n`;
                        }
                    }
                }

                code += '\n';

                // Set parameters to SAFE values (not boundaries)
                if (func.parameters.length > 0) {
                    code += '    // Set parameters to safe values\n';
                    for (const param of func.parameters) {
                        const safeValue = this.getSafeValue(param.type);
                        code += `    ${param.type} ${param.name} = ${safeValue};\n`;
                    }
                }

                // Call function
                code += '\n';
                code += '    // Act\n';
                code += `    ${func.returnType} result = ${func.name}(`;
                if (func.parameters.length > 0) {
                    code += func.parameters.map(p => p.name).join(', ');
                }
                code += ');\n';

                code += '\n';
                code += '    // Assert\n';
                
                // Try intelligent assertion for global = 0
                if (boundary.label === 'zero' && this.looksLikeMultiplication(func.name)) {
                    code += `    EXPECT_EQ(result, 0);  // Multiplying by zero should yield zero\n`;
                } else {
                    code += `    // Result depends on global ${global.name} = ${boundary.literal}\n`;
                    code += '    // TODO: Verify result against expected value\n';
                }

                code += '}\n\n';
            }
        }

        return code;
    }

    /**
     * Generate critical combination tests (stress tests)
     */
    private static generateCombinationTests(
        func: FunctionInfo,
        globals: GlobalVariable[]
    ): string {
        
        const className = this.capitalize(func.name) + 'Fixture';
        let code = '// ========================================\n';
        code += '// Critical Combination Tests (stress tests)\n';
        code += '// ========================================\n\n';

        // Test 1: All minimums
        code += `TEST_F(${className}, Combination_AllMinimums) {\n`;
        code += '    // Set all globals to minimum\n';
        for (const global of globals) {
            const boundaries = getBoundariesForType(global.type);
            const minBoundary = boundaries.find(b => b.label === 'minimum');
            if (minBoundary) {
                code += `    ${global.name} = ${minBoundary.literal};\n`;
            }
        }
        
        if (func.parameters.length > 0) {
            code += '\n';
            code += '    // Set all parameters to minimum\n';
            for (const param of func.parameters) {
                const boundaries = getBoundariesForType(param.type);
                const minBoundary = boundaries.find(b => b.label === 'minimum');
                if (minBoundary) {
                    code += `    ${param.type} ${param.name} = ${minBoundary.literal};\n`;
                }
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
        code += '    // Extreme stress test: all inputs at minimum\n';
        code += '    // TODO: Verify result (may overflow/underflow)\n';
        code += '}\n\n';

        // Test 2: All maximums
        code += `TEST_F(${className}, Combination_AllMaximums) {\n`;
        code += '    // Set all globals to maximum\n';
        for (const global of globals) {
            const boundaries = getBoundariesForType(global.type);
            const maxBoundary = boundaries.find(b => b.label === 'maximum');
            if (maxBoundary) {
                code += `    ${global.name} = ${maxBoundary.literal};\n`;
            }
        }
        
        if (func.parameters.length > 0) {
            code += '\n';
            code += '    // Set all parameters to maximum\n';
            for (const param of func.parameters) {
                const boundaries = getBoundariesForType(param.type);
                const maxBoundary = boundaries.find(b => b.label === 'maximum');
                if (maxBoundary) {
                    code += `    ${param.type} ${param.name} = ${maxBoundary.literal};\n`;
                }
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
        code += '    // Extreme stress test: all inputs at maximum\n';
        code += '    // TODO: Verify result (may overflow/underflow)\n';
        code += '}\n\n';

        // Test 3: Mixed (param min, global max) - only if both params and globals exist
        if (func.parameters.length > 0 && globals.length > 0) {
            code += `TEST_F(${className}, Combination_ParamMin_GlobalMax) {\n`;
            code += '    // Set globals to maximum\n';
            for (const global of globals) {
                const boundaries = getBoundariesForType(global.type);
                const maxBoundary = boundaries.find(b => b.label === 'maximum');
                if (maxBoundary) {
                    code += `    ${global.name} = ${maxBoundary.literal};\n`;
                }
            }
            
            code += '\n';
            code += '    // Set parameters to minimum\n';
            for (const param of func.parameters) {
                const boundaries = getBoundariesForType(param.type);
                const minBoundary = boundaries.find(b => b.label === 'minimum');
                if (minBoundary) {
                    code += `    ${param.type} ${param.name} = ${minBoundary.literal};\n`;
                }
            }
            
            code += '\n';
            code += '    // Act\n';
            code += `    ${func.returnType} result = ${func.name}(`;
            code += func.parameters.map(p => p.name).join(', ');
            code += ');\n';
            code += '\n';
            code += '    // Assert\n';
            code += '    // Mixed boundary test\n';
            code += '    // TODO: Verify result\n';
            code += '}\n\n';
        }

        return code;
    }

    /**
     * Get a safe "normal" value for a type (not a boundary)
     */
    private static getSafeValue(type: string): string {
        const cleanType = type.trim().replace(/\s+/g, ' ');
        
        if (cleanType.includes('unsigned')) {
            return '10';
        }
        
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

    /**
     * Get default value for a type (for uninitialized globals)
     */
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

    /**
     * Check if function name suggests multiplication
     */
    private static looksLikeMultiplication(funcName: string): boolean {
        const name = funcName.toLowerCase();
        return name.includes('mult') || 
               name.includes('scale') || 
               name.includes('product');
    }

    /**
     * Check if all values in an array are zero
     */
    private static isAllZero(values: string[]): boolean {
        return values.every(v => {
            const trimmed = v.trim();
            return trimmed === '0' || trimmed === '0L' || trimmed === '0U' || 
                   trimmed === '0UL' || trimmed === '0.0f' || trimmed === '0.0' ||
                   trimmed === "'\\0'";
        });
    }

    /**
     * Generate assertion for when all parameters are zero
     */
    private static generateZeroAssertion(func: FunctionInfo): string | null {
        const name = func.name.toLowerCase();
        
        // Addition/sum: 0 + 0 = 0
        if (name.includes('add') || name.includes('sum')) {
            return 'EXPECT_EQ(result, 0);  // Sum of zeros should be zero';
        }
        
        // Multiplication/product: 0 * anything = 0
        if (name.includes('mult') || name.includes('prod')) {
            return 'EXPECT_EQ(result, 0);  // Product with zero should be zero';
        }
        
        // Subtraction: 0 - 0 = 0
        if (name.includes('sub')) {
            return 'EXPECT_EQ(result, 0);  // Difference of zeros should be zero';
        }
        
        return null;
    }

    /**
     * Sanitize label for test name (remove special characters)
     */
    private static sanitizeLabel(label: string): string {
        return label
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Capitalize first letter
     */
    private static capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Generate regular tests (for functions without globals) - this is the original implementation
     */
    private static generateRegularTests(func: FunctionInfo): string {
        const boundarySets = generateBoundarySets(func.parameters);
        let code = '';
        
        for (const boundarySet of boundarySets) {
            code += this.generateSingleTest(func, boundarySet);
            code += '\n\n';
        }
        
        return code;
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