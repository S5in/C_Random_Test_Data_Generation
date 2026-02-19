/**
 * Global Usage Analyzer
 * 
 * Analyzes which functions use which global variables
 */

import { FunctionInfo, GlobalVariable } from '../types';

export class GlobalUsageAnalyzer {
    /**
     * Analyze which globals are used by which functions
     * 
     * @param functions - List of functions
     * @param globals - List of global variables
     * @param sourceCode - Full source code text
     * @returns Map of function name to array of globals used
     */
    static analyzeUsage(
        functions: FunctionInfo[],
        globals: GlobalVariable[],
        sourceCode: string
    ): Map<string, GlobalVariable[]> {
        
        const usage = new Map<string, GlobalVariable[]>();

        try {
            const lines = sourceCode.split('\n');

            for (const func of functions) {
                const usedGlobals: GlobalVariable[] = [];

                // Get function body text (based on line numbers)
                const funcBody = lines.slice(func.startLine, func.endLine + 1).join('\n');

                for (const global of globals) {
                    // Skip const globals (they're constants, not variable inputs)
                    if (global.isConst) {
                        continue;
                    }

                    // Check if global is referenced in function body
                    // Use word boundary regex to avoid false matches
                    const globalRegex = new RegExp(`\\b${this.escapeRegex(global.name)}\\b`);
                    
                    if (globalRegex.test(funcBody)) {
                        usedGlobals.push(global);
                    }
                }

                if (usedGlobals.length > 0) {
                    usage.set(func.name, usedGlobals);
                }
            }

        } catch (error) {
            console.error('[GlobalUsageAnalyzer] Error analyzing usage:', error);
        }

        return usage;
    }

    /**
     * Escape special regex characters
     */
    private static escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get a summary of global usage (for logging/debugging)
     */
    static getGlobalSummary(
        globals: GlobalVariable[],
        usage: Map<string, GlobalVariable[]>
    ): string {
        let summary = `\n📊 Global Variable Analysis:\n`;
        summary += `${'='.repeat(60)}\n`;
        summary += `Found ${globals.length} global variable(s):\n\n`;

        for (const global of globals) {
            summary += `  • ${global.name} (${global.type})`;
            
            if (global.isStatic) summary += ' [static]';
            if (global.isConst) summary += ' [const]';
            if (global.initialValue) summary += ` = ${global.initialValue}`;
            
            // Find which functions use this global
            const usingFunctions: string[] = [];
            for (const [funcName, usedGlobals] of usage.entries()) {
                if (usedGlobals.some(g => g.name === global.name)) {
                    usingFunctions.push(funcName);
                }
            }
            
            if (usingFunctions.length > 0) {
                summary += `\n    Used by: ${usingFunctions.join(', ')}`;
            } else if (!global.isConst) {
                summary += `\n    Not used by any function`;
            }
            
            summary += '\n';
        }

        summary += `${'='.repeat(60)}\n`;
        return summary;
    }

    /**
     * Count total tests that will be generated for functions with globals
     */
    static estimateTestCount(
        func: FunctionInfo,
        usedGlobals: GlobalVariable[],
        boundariesPerType: number = 5  // Default: min, max, zero, near-zero, random
    ): number {
        
        if (usedGlobals.length === 0) {
            // No globals: regular tests
            return boundariesPerType * Math.max(1, func.parameters.length);
        }

        // With globals:
        // - Parameter tests: boundariesPerType per parameter
        // - Global tests: boundariesPerType per global
        // - Combination tests: 3 (all min, all max, mixed)
        
        const paramTests = boundariesPerType * Math.max(1, func.parameters.length);
        const globalTests = boundariesPerType * usedGlobals.length;
        const combinationTests = 3;

        return paramTests + globalTests + combinationTests;
    }
}