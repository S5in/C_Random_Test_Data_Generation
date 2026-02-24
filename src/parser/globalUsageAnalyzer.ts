/**
 * Global Usage Analyzer
 * 
 * Analyzes which global variables a function uses
 */

import { FunctionInfo, GlobalVariable } from '../types';
import { generateBoundarySets, getBoundariesForType } from '../generator/boundaryValues';

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
     * Estimate test count for a function.
     * Uses actual boundary set generation to count accurately.
     */
    static estimateTestCount(
        func: FunctionInfo,
        usedGlobals: GlobalVariable[]
    ): number {
        
        if (usedGlobals.length === 0) {
            // No globals: one test per boundary class (not per parameter)
            return generateBoundarySets(func.parameters).length;
        }

        // With globals:
        // Parameter boundary tests: one per boundary class
        const paramTests = generateBoundarySets(func.parameters).length;
        
        // Global boundary tests: one per boundary value per global
        let globalTests = 0;
        for (const global of usedGlobals) {
            globalTests += getBoundariesForType(global.type).length;
        }
        
        // Combination tests: AllMinimums + AllMaximums + (ParamMin_GlobalMax if both exist)
        const combinationTests = (func.parameters.length > 0 && usedGlobals.length > 0) ? 3 : 2;

        return paramTests + globalTests + combinationTests;
    }
}