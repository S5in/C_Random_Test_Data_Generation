/**
 * Boundary Value Analysis
 * 
 * Provides boundary values for primitive C types.
 * Supports proper BVA with min, min+1, max-1, max boundaries.
 */

import { FunctionParameter } from '../types';

/**
 * Represents a single boundary value for testing
 */
export interface BoundaryValue {
    /** Human-readable label (e.g., "minimum", "maximum") */
    label: string;
    
    /** C literal value (e.g., "INT_MIN", "0", "1.0f") */
    literal: string;
    
    /** Header file required (e.g., "climits") */
    requiresHeader?: string;
}

/**
 * Catalog of boundary values for each C type.
 * Includes proper BVA boundaries: min, min+1, max-1, max
 */
const BOUNDARY_CATALOG: Record<string, BoundaryValue[]> = {
    'int': [
        { label: 'minimum', literal: 'INT_MIN', requiresHeader: 'climits' },
        { label: 'minimum-plus-one', literal: '(INT_MIN + 1)', requiresHeader: 'climits' },
        { label: 'maximum-minus-one', literal: '(INT_MAX - 1)', requiresHeader: 'climits' },
        { label: 'maximum', literal: 'INT_MAX', requiresHeader: 'climits' },
        { label: 'zero', literal: '0' }
    ],
    
    'unsigned int': [
        { label: 'minimum', literal: '0' },
        { label: 'minimum-plus-one', literal: '1' },
        { label: 'maximum-minus-one', literal: '(UINT_MAX - 1)', requiresHeader: 'climits' },
        { label: 'maximum', literal: 'UINT_MAX', requiresHeader: 'climits' },
        { label: 'zero', literal: '0' }
    ],
    
    'long': [
        { label: 'minimum', literal: 'LONG_MIN', requiresHeader: 'climits' },
        { label: 'minimum-plus-one', literal: '(LONG_MIN + 1)', requiresHeader: 'climits' },
        { label: 'maximum-minus-one', literal: '(LONG_MAX - 1)', requiresHeader: 'climits' },
        { label: 'maximum', literal: 'LONG_MAX', requiresHeader: 'climits' },
        { label: 'zero', literal: '0L' }
    ],
    
    'unsigned long': [
        { label: 'minimum', literal: '0UL' },
        { label: 'minimum-plus-one', literal: '1UL' },
        { label: 'maximum-minus-one', literal: '(ULONG_MAX - 1)', requiresHeader: 'climits' },
        { label: 'maximum', literal: 'ULONG_MAX', requiresHeader: 'climits' },
        { label: 'zero', literal: '0UL' }
    ],
    
    'short': [
        { label: 'minimum', literal: 'SHRT_MIN', requiresHeader: 'climits' },
        { label: 'minimum-plus-one', literal: '(SHRT_MIN + 1)', requiresHeader: 'climits' },
        { label: 'maximum-minus-one', literal: '(SHRT_MAX - 1)', requiresHeader: 'climits' },
        { label: 'maximum', literal: 'SHRT_MAX', requiresHeader: 'climits' },
        { label: 'zero', literal: '0' }
    ],
    
    'unsigned short': [
        { label: 'minimum', literal: '0' },
        { label: 'minimum-plus-one', literal: '1' },
        { label: 'maximum-minus-one', literal: '(USHRT_MAX - 1)', requiresHeader: 'climits' },
        { label: 'maximum', literal: 'USHRT_MAX', requiresHeader: 'climits' },
        { label: 'zero', literal: '0' }
    ],
    
    'char': [
        { label: 'minimum', literal: 'CHAR_MIN', requiresHeader: 'climits' },
        { label: 'minimum-plus-one', literal: '(CHAR_MIN + 1)', requiresHeader: 'climits' },
        { label: 'maximum-minus-one', literal: '(CHAR_MAX - 1)', requiresHeader: 'climits' },
        { label: 'maximum', literal: 'CHAR_MAX', requiresHeader: 'climits' },
        { label: 'zero', literal: "'\\0'" }
    ],
    
    'unsigned char': [
        { label: 'minimum', literal: '0' },
        { label: 'minimum-plus-one', literal: '1' },
        { label: 'maximum-minus-one', literal: '(UCHAR_MAX - 1)', requiresHeader: 'climits' },
        { label: 'maximum', literal: 'UCHAR_MAX', requiresHeader: 'climits' },
        { label: 'zero', literal: '0' }
    ],
    
    'float': [
        { label: 'minimum', literal: '-FLT_MAX', requiresHeader: 'cfloat' },
        { label: 'minimum-plus-epsilon', literal: '(-FLT_MAX + FLT_EPSILON)', requiresHeader: 'cfloat' },
        { label: 'maximum-minus-epsilon', literal: '(FLT_MAX - FLT_EPSILON)', requiresHeader: 'cfloat' },
        { label: 'maximum', literal: 'FLT_MAX', requiresHeader: 'cfloat' },
        { label: 'zero', literal: '0.0f' },
        { label: 'near-zero-positive', literal: 'FLT_EPSILON', requiresHeader: 'cfloat' },
        { label: 'near-zero-negative', literal: '-FLT_EPSILON', requiresHeader: 'cfloat' }
    ],
    
    'double': [
        { label: 'minimum', literal: '-DBL_MAX', requiresHeader: 'cfloat' },
        { label: 'minimum-plus-epsilon', literal: '(-DBL_MAX + DBL_EPSILON)', requiresHeader: 'cfloat' },
        { label: 'maximum-minus-epsilon', literal: '(DBL_MAX - DBL_EPSILON)', requiresHeader: 'cfloat' },
        { label: 'maximum', literal: 'DBL_MAX', requiresHeader: 'cfloat' },
        { label: 'zero', literal: '0.0' },
        { label: 'near-zero-positive', literal: 'DBL_EPSILON', requiresHeader: 'cfloat' },
        { label: 'near-zero-negative', literal: '-DBL_EPSILON', requiresHeader: 'cfloat' }
    ]
};

/**
 * Normalize type string (remove extra whitespace, standardize format)
 */
function normalizeType(type: string): string {
    return type.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Check if type is a pointer or array
 */
function isPointerOrArray(type: string): boolean {
    return type.includes('*') || type.includes('[');
}

/**
 * Get boundary values for a given C type
 */
export function getBoundaryValues(type: string): BoundaryValue[] {
    const normalized = normalizeType(type);
    return BOUNDARY_CATALOG[normalized] || [];
}

/**
 * Alias for getBoundaryValues (for compatibility)
 */
export function getBoundariesForType(type: string): BoundaryValue[] {
    return getBoundaryValues(type);
}

/**
 * Check if a type is supported for boundary testing
 */
export function isSupportedType(type: string): boolean {
    const normalized = normalizeType(type);
    return normalized in BOUNDARY_CATALOG;
}

/**
 * Represents a complete test case with values for all parameters.
 */
export interface BoundarySet {
    /** Human-readable label for test name (e.g., "Param_a_Min") */
    label: string;
    
    /** Human-readable description */
    description: string;
    
    /** Array of C literal values (one per parameter, in order) */
    values: string[];
    
    /** Headers needed for this test case */
    requiredHeaders: string[];
}

/**
 * Generates proper boundary value analysis tests.
 * 
 * Strategy (Hybrid Approach):
 * 1. One baseline test (all nominal/zero)
 * 2. One-at-a-time boundary tests (vary each param individually)
 *    - Skip "zero" boundary (already covered by baseline)
 *    - Use TRUE boundaries: min, min+1, max-1, max
 * 3. Critical combination tests (all-min, all-max for overflow detection)
 * 
 * For 3 params:
 * - 1 baseline
 * - 3 params × 4 boundaries (min, min+1, max-1, max) = 12 tests
 * - 2 combination tests (all-min, all-max)
 * = 15 unique tests (NO DUPLICATES)
 * 
 * @param params - Function parameters
 * @returns Array of boundary test sets
 */
export function generateBoundarySets(params: FunctionParameter[]): BoundarySet[] {
    const supportedParams = params.filter(p => 
        isSupportedType(p.type) && !isPointerOrArray(p.type)
    );
    
    if (supportedParams.length === 0) {
        return [{
            label: 'BasicTest',
            description: 'Basic test case (manual initialization required)',
            values: params.map(() => '/* TODO: initialize */'),
            requiredHeaders: []
        }];
    }
    
    const sets: BoundarySet[] = [];
    
    // TRUE boundary classes for proper BVA (skip zero - covered by baseline)
    const boundaryClasses = [
        'minimum',
        'minimum-plus-one',
        'maximum-minus-one',
        'maximum'
    ];
    
    // Helper: Get nominal (zero) value
    const getNominalValue = (type: string): string => {
        const boundaries = getBoundaryValues(type);
        const zero = boundaries.find(b => b.label === 'zero');
        return zero?.literal || '0';
    };
    
    // ========================================
    // 1. BASELINE TEST (all nominal/zero)
    // ========================================
    const baselineValues: string[] = [];
    for (const param of params) {
        if (isPointerOrArray(param.type)) {
            baselineValues.push('/* TODO: initialize pointer/array */');
        } else {
            baselineValues.push(getNominalValue(param.type));
        }
    }
    
    sets.push({
        label: 'Baseline_AllZero',
        description: 'Baseline test with all parameters at zero',
        values: baselineValues,
        requiredHeaders: []
    });
    
    // ========================================
    // 2. ONE-AT-A-TIME BOUNDARY TESTS
    //    (Skip zero - already covered by baseline)
    // ========================================
    for (let paramIndex = 0; paramIndex < params.length; paramIndex++) {
        const param = params[paramIndex];
        
        if (isPointerOrArray(param.type)) continue;
        
        const boundaries = getBoundaryValues(param.type);
        if (boundaries.length === 0) continue;
        
        for (const boundaryClass of boundaryClasses) {
            const boundary = boundaries.find(b => b.label === boundaryClass);
            if (!boundary) continue;
            
            const values: string[] = [];
            const headers = new Set<string>();
            
            for (let i = 0; i < params.length; i++) {
                if (i === paramIndex) {
                    // THIS parameter gets boundary value
                    values.push(boundary.literal);
                    if (boundary.requiresHeader) {
                        headers.add(boundary.requiresHeader);
                    }
                } else {
                    // OTHER parameters stay at zero
                    if (isPointerOrArray(params[i].type)) {
                        values.push('/* TODO: initialize pointer/array */');
                    } else {
                        values.push(getNominalValue(params[i].type));
                    }
                }
            }
            
            sets.push({
                label: `Param_${param.name}_${sanitizeBoundaryLabel(boundaryClass)}`,
                description: `Vary ${param.name} to ${boundaryClass}, others at zero`,
                values,
                requiredHeaders: Array.from(headers)
            });
        }
    }
    
    // ========================================
    // 3. COMBINATION TESTS (Critical for overflow detection)
    // ========================================
    
    // Test: All parameters at MINIMUM
    const allMinValues: string[] = [];
    const allMinHeaders = new Set<string>();
    for (const param of params) {
        if (isPointerOrArray(param.type)) {
            allMinValues.push('/* TODO: initialize pointer/array */');
        } else {
            const boundaries = getBoundaryValues(param.type);
            const minBoundary = boundaries.find(b => b.label === 'minimum');
            if (minBoundary) {
                allMinValues.push(minBoundary.literal);
                if (minBoundary.requiresHeader) {
                    allMinHeaders.add(minBoundary.requiresHeader);
                }
            } else {
                allMinValues.push(getNominalValue(param.type));
            }
        }
    }
    
    sets.push({
        label: 'Combination_AllMin',
        description: 'All parameters at minimum (underflow test)',
        values: allMinValues,
        requiredHeaders: Array.from(allMinHeaders)
    });
    
    // Test: All parameters at MAXIMUM
    const allMaxValues: string[] = [];
    const allMaxHeaders = new Set<string>();
    for (const param of params) {
        if (isPointerOrArray(param.type)) {
            allMaxValues.push('/* TODO: initialize pointer/array */');
        } else {
            const boundaries = getBoundaryValues(param.type);
            const maxBoundary = boundaries.find(b => b.label === 'maximum');
            if (maxBoundary) {
                allMaxValues.push(maxBoundary.literal);
                if (maxBoundary.requiresHeader) {
                    allMaxHeaders.add(maxBoundary.requiresHeader);
                }
            } else {
                allMaxValues.push(getNominalValue(param.type));
            }
        }
    }
    
    sets.push({
        label: 'Combination_AllMax',
        description: 'All parameters at maximum (overflow test)',
        values: allMaxValues,
        requiredHeaders: Array.from(allMaxHeaders)
    });
    
    return sets;
}

/**
 * Helper: Sanitize boundary class labels for test names
 */
function sanitizeBoundaryLabel(label: string): string {
    return label
        .replace(/minimum-plus-one/g, 'MinPlusOne')
        .replace(/maximum-minus-one/g, 'MaxMinusOne')
        .replace(/minimum-plus-epsilon/g, 'MinPlusEpsilon')
        .replace(/maximum-minus-epsilon/g, 'MaxMinusEpsilon')
        .replace(/minimum/g, 'Min')
        .replace(/maximum/g, 'Max')
        .replace(/zero/g, 'Zero')
        .replace(/near-zero-positive/g, 'NearZeroPos')
        .replace(/near-zero-negative/g, 'NearZeroNeg')
        .replace(/-/g, '_');
}

/**
 * Gets a human-readable summary of boundary coverage for a function.
 * 
 * @param params - Function parameters
 * @returns Summary string (e.g., "15 test cases for 3 parameters (int, int, int)")
 */
export function getBoundarySummary(params: FunctionParameter[]): string {
    const sets = generateBoundarySets(params);
    const supportedTypes = params
        .filter(p => isSupportedType(p.type) && !isPointerOrArray(p.type))
        .map(p => normalizeType(p.type));
    
    const uniqueTypes = Array.from(new Set(supportedTypes));
    
    return `${sets.length} test cases for ${params.length} parameter(s) (${uniqueTypes.join(', ') || 'unsupported types'})`;
}