/**
 * Global Usage Analyzer
 * 
 * Analyzes which global variables a function uses
 */

import { FunctionInfo, GlobalVariable } from '../types';

export class GlobalUsageAnalyzer {
    /**
     * ✨ SIMPLIFIED: Analyze which globals a SINGLE function uses
     */
    static analyzeFunction(
        func: FunctionInfo,
        globals: GlobalVariable[],
        sourceCode: string
    ): GlobalVariable[] {
        
        const usedGlobals: GlobalVariable[] = [];

        try {
            const lines = sourceCode.split('\n');
            const funcBody = lines.slice(func.startLine, func.endLine + 1).join('\n');

            for (const global of globals) {
                // Skip const globals (they're constants, not variable inputs)
                if (global.isConst) {
                    continue;
                }

                // Check if global is referenced in function body
                const globalRegex = new RegExp(`\\b${this.escapeRegex(global.name)}\\b`);
                
                if (globalRegex.test(funcBody)) {
                    usedGlobals.push(global);
                }
            }

        } catch (error) {
            console.error('[GlobalUsageAnalyzer] Error analyzing function:', error);
        }

        return usedGlobals;
    }

    /**
     * Escape special regex characters
     */
    private static escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get a summary of global usage for a single function
     */
    static getFunctionGlobalSummary(
        func: FunctionInfo,
        usedGlobals: GlobalVariable[]
    ): string {
        if (usedGlobals.length === 0) {
            return `Function ${func.name}() does not use any global variables.`;
        }

        let summary = `Function ${func.name}() uses ${usedGlobals.length} global variable(s):\n`;
        
        for (const global of usedGlobals) {
            summary += `  • ${global.name} (${global.type})`;
            if (global.initialValue) {
                summary += ` = ${global.initialValue}`;
            }
            summary += '\n';
        }

        return summary;
    }

    /**
     * Estimate test count for a function
     */
    static estimateTestCount(
        func: FunctionInfo,
        usedGlobals: GlobalVariable[],
        boundariesPerType: number = 5
    ): number {
        
        if (usedGlobals.length === 0) {
            // No globals: regular tests
            return boundariesPerType * Math.max(1, func.parameters.length);
        }

        // With globals:
        const paramTests = boundariesPerType * Math.max(1, func.parameters.length);
        const globalTests = boundariesPerType * usedGlobals.length;
        const combinationTests = 3;

        return paramTests + globalTests + combinationTests;
    }
}