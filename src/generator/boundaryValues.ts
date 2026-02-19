/**
 * Boundary Value Provider
 * 
 * Provides boundary test values for C primitive types based on
 * Boundary Value Analysis (BVA) testing principles.
 */

import { FunctionParameter } from '../types';

/**
 * Represents a single boundary value for a C type.
 */
export interface BoundaryValue {
    /** The C literal value (e.g., "0", "INT_MAX", "3.14f") */
    literal: string;
    
    /** Human-readable description (e.g., "zero", "maximum", "minimum") */
    label: string;
    
    /** Optional: whether this value requires #include <limits.h> or <float.h> */
    requiresHeader?: 'limits.h' | 'float.h';
}

/**
 * Maps C types to their boundary values.
 * 
 * Each type has:
 * - min: Minimum representable value
 * - max: Maximum representable value  
 * - zero: Zero/identity value
 * - nearZero: Values close to zero (for testing sign changes)
 * - random: A typical in-range value
 */
const BOUNDARY_CATALOG: Record<string, {
    min?: BoundaryValue;
    max?: BoundaryValue;
    zero: BoundaryValue;
    nearZero?: BoundaryValue[];
    random: BoundaryValue;
}> = {
    // Signed integers
    'int': {
        min: { literal: 'INT_MIN', label: 'minimum', requiresHeader: 'limits.h' },
        max: { literal: 'INT_MAX', label: 'maximum', requiresHeader: 'limits.h' },
        zero: { literal: '0', label: 'zero' },
        nearZero: [
            { literal: '1', label: 'near-zero positive' },
            { literal: '-1', label: 'near-zero negative' }
        ],
        random: { literal: '42', label: 'random' }
    },
    
    'long': {
        min: { literal: 'LONG_MIN', label: 'minimum', requiresHeader: 'limits.h' },
        max: { literal: 'LONG_MAX', label: 'maximum', requiresHeader: 'limits.h' },
        zero: { literal: '0L', label: 'zero' },
        nearZero: [
            { literal: '1L', label: 'near-zero positive' },
            { literal: '-1L', label: 'near-zero negative' }
        ],
        random: { literal: '123456L', label: 'random' }
    },
    
    'short': {
        min: { literal: 'SHRT_MIN', label: 'minimum', requiresHeader: 'limits.h' },
        max: { literal: 'SHRT_MAX', label: 'maximum', requiresHeader: 'limits.h' },
        zero: { literal: '0', label: 'zero' },
        nearZero: [
            { literal: '1', label: 'near-zero positive' },
            { literal: '-1', label: 'near-zero negative' }
        ],
        random: { literal: '100', label: 'random' }
    },
    
    'char': {
        min: { literal: 'CHAR_MIN', label: 'minimum', requiresHeader: 'limits.h' },
        max: { literal: 'CHAR_MAX', label: 'maximum', requiresHeader: 'limits.h' },
        zero: { literal: '0', label: 'zero' },
        nearZero: [
            { literal: '\'A\'', label: 'printable ASCII' },
            { literal: '\'\\n\'', label: 'newline' }
        ],
        random: { literal: '\'x\'', label: 'random' }
    },
    
    // Unsigned integers
    'unsigned int': {
        max: { literal: 'UINT_MAX', label: 'maximum', requiresHeader: 'limits.h' },
        zero: { literal: '0U', label: 'zero' },
        nearZero: [
            { literal: '1U', label: 'near-zero' }
        ],
        random: { literal: '42U', label: 'random' }
    },
    
    'unsigned long': {
        max: { literal: 'ULONG_MAX', label: 'maximum', requiresHeader: 'limits.h' },
        zero: { literal: '0UL', label: 'zero' },
        nearZero: [
            { literal: '1UL', label: 'near-zero' }
        ],
        random: { literal: '123456UL', label: 'random' }
    },
    
    'unsigned short': {
        max: { literal: 'USHRT_MAX', label: 'maximum', requiresHeader: 'limits.h' },
        zero: { literal: '0', label: 'zero' },
        nearZero: [
            { literal: '1', label: 'near-zero' }
        ],
        random: { literal: '100', label: 'random' }
    },
    
    'unsigned char': {
        max: { literal: 'UCHAR_MAX', label: 'maximum', requiresHeader: 'limits.h' },
        zero: { literal: '0', label: 'zero' },
        nearZero: [
            { literal: '1', label: 'near-zero' }
        ],
        random: { literal: '128', label: 'random' }
    },
    
    // Floating point
    'float': {
        min: { literal: '-FLT_MAX', label: 'minimum', requiresHeader: 'float.h' },
        max: { literal: 'FLT_MAX', label: 'maximum', requiresHeader: 'float.h' },
        zero: { literal: '0.0f', label: 'zero' },
        nearZero: [
            { literal: '1.0f', label: 'near-zero positive' },
            { literal: '-1.0f', label: 'near-zero negative' },
            { literal: 'FLT_MIN', label: 'smallest positive', requiresHeader: 'float.h' }
        ],
        random: { literal: '3.14159f', label: 'random' }
    },
    
    'double': {
        min: { literal: '-DBL_MAX', label: 'minimum', requiresHeader: 'float.h' },
        max: { literal: 'DBL_MAX', label: 'maximum', requiresHeader: 'float.h' },
        zero: { literal: '0.0', label: 'zero' },
        nearZero: [
            { literal: '1.0', label: 'near-zero positive' },
            { literal: '-1.0', label: 'near-zero negative' },
            { literal: 'DBL_MIN', label: 'smallest positive', requiresHeader: 'float.h' }
        ],
        random: { literal: '2.718281828', label: 'random' }
    },
    
    // Boolean (C99 _Bool / stdbool.h bool)
    'bool': {
        zero: { literal: 'false', label: 'false' },
        random: { literal: 'true', label: 'true' }
    },
    '_Bool': {
        zero: { literal: '0', label: 'false' },
        random: { literal: '1', label: 'true' }
    }
};

/**
 * Normalizes a C type string by removing qualifiers and extra whitespace.
 * 
 * Examples:
 *   "const int" → "int"
 *   "unsigned  int" → "unsigned int"
 *   "float  *" → "float"
 * 
 * @param type - Raw C type string
 * @returns Normalized type string
 */
function normalizeType(type: string): string {
    return type
        .replace(/\bconst\b/g, '')      // Remove const
        .replace(/\bvolatile\b/g, '')   // Remove volatile
        .replace(/\bstatic\b/g, '')     // Remove static
        .replace(/\brestrict\b/g, '')   // Remove restrict
        .replace(/\*/g, '')             // Remove pointers (we'll handle those separately)
        .replace(/\[.*?\]/g, '')        // Remove array brackets
        .trim()
        .replace(/\s+/g, ' ');          // Normalize whitespace
}

/**
 * Checks if a C type is a pointer or array.
 * 
 * @param type - Raw C type string
 * @returns true if type contains * or []
 */
function isPointerOrArray(type: string): boolean {
    return type.includes('*') || type.includes('[');
}

/**
 * Gets all boundary values for a given C type.
 * 
 * @param type - C type string (e.g., "int", "const float", "unsigned long")
 * @returns Array of boundary values, or empty array if type not supported
 */
export function getBoundaryValues(type: string): BoundaryValue[] {
    const normalized = normalizeType(type);
    const catalog = BOUNDARY_CATALOG[normalized];
    
    if (!catalog) {
        return [];
    }
    
    const values: BoundaryValue[] = [];
    
    if (catalog.min) values.push(catalog.min);
    if (catalog.max) values.push(catalog.max);
    values.push(catalog.zero);
    if (catalog.nearZero) values.push(...catalog.nearZero);
    values.push(catalog.random);
    
    return values;
}

/**
 * Alias for getBoundaryValues (for backwards compatibility)
 */
export const getBoundariesForType = getBoundaryValues;

/**
 * Gets required C headers for a type's boundary values.
 * 
 * @param type - C type string
 * @returns Array of header names (e.g., ["limits.h", "float.h"])
 */
export function getRequiredHeaders(type: string): string[] {
    const boundaries = getBoundaryValues(type);
    const headers = new Set<string>();
    
    for (const boundary of boundaries) {
        if (boundary.requiresHeader) {
            headers.add(boundary.requiresHeader);
        }
    }
    
    return Array.from(headers);
}

/**
 * Checks if a type is supported for boundary value generation.
 * 
 * @param type - C type string
 * @returns true if we have boundary values for this type
 */
export function isSupportedType(type: string): boolean {
    const normalized = normalizeType(type);
    return normalized in BOUNDARY_CATALOG;
}

/**
 * Represents a complete test case with values for all parameters.
 */
export interface BoundarySet {
    /** Test case name (e.g., "MinValues", "MaxValues") */
    name: string;
    
    /** Human-readable description */
    description: string;
    
    /** Map of parameter name → C literal value */
    values: Map<string, string>;
    
    /** Headers needed for this test case */
    requiredHeaders: string[];
}

/**
 * Generates boundary test sets for a function's parameters.
 * 
 * Strategy:
 * - One test per boundary class (min, max, zero, near-zero, random)
 * - All params in a test use the same boundary class
 * - Skips unsupported types (pointers, structs, etc.)
 * 
 * @param params - Function parameters
 * @returns Array of boundary test sets
 */
export function generateBoundarySets(params: FunctionParameter[]): BoundarySet[] {
    // Filter to only supported primitive types
    const supportedParams = params.filter(p => 
        isSupportedType(p.type) && !isPointerOrArray(p.type)
    );
    
    if (supportedParams.length === 0) {
        // No supported params → generate one basic test with TODOs
        return [{
            name: 'BasicTest',
            description: 'Basic test case (manual initialization required)',
            values: new Map(params.map(p => [p.name, '/* TODO: initialize */'])),
            requiredHeaders: []
        }];
    }
    
    const sets: BoundarySet[] = [];
    
    // Helper to create a boundary set for a given boundary class
    const createSet = (
        name: string,
        description: string,
        selector: (boundaries: BoundaryValue[]) => BoundaryValue | undefined
    ) => {
        const values = new Map<string, string>();
        const headers = new Set<string>();
        
        for (const param of params) {
            if (isPointerOrArray(param.type)) {
                values.set(param.name, '/* TODO: initialize pointer/array */');
                continue;
            }
            
            const boundaries = getBoundaryValues(param.type);
            if (boundaries.length === 0) {
                values.set(param.name, '/* TODO: initialize */');
                continue;
            }
            
            const boundary = selector(boundaries);
            if (boundary) {
                values.set(param.name, boundary.literal);
                if (boundary.requiresHeader) {
                    headers.add(boundary.requiresHeader);
                }
            } else {
                // Fallback to zero if selector didn't find a match
                const zero = boundaries.find(b => b.label === 'zero');
                values.set(param.name, zero?.literal || '0');
            }
        }
        
        sets.push({
            name,
            description,
            values,
            requiredHeaders: Array.from(headers)
        });
    };
    
    // Generate boundary sets
    createSet(
        'MinValues',
        'Test with minimum boundary values',
        boundaries => boundaries.find(b => b.label === 'minimum')
    );
    
    createSet(
        'MaxValues',
        'Test with maximum boundary values',
        boundaries => boundaries.find(b => b.label === 'maximum')
    );
    
    createSet(
        'ZeroValues',
        'Test with zero values',
        boundaries => boundaries.find(b => b.label === 'zero')
    );
    
    createSet(
        'NearZeroValues',
        'Test with near-zero values',
        boundaries => boundaries.find(b => b.label.includes('near-zero'))
    );
    
    createSet(
        'RandomValues',
        'Test with random values',
        boundaries => boundaries.find(b => b.label === 'random')
    );
    
    return sets;
}

/**
 * Gets a human-readable summary of boundary coverage for a function.
 * 
 * @param params - Function parameters
 * @returns Summary string (e.g., "5 test cases for 2 parameters (int, float)")
 */
export function getBoundarySummary(params: FunctionParameter[]): string {
    const sets = generateBoundarySets(params);
    const supportedTypes = params
        .filter(p => isSupportedType(p.type) && !isPointerOrArray(p.type))
        .map(p => normalizeType(p.type));
    
    const uniqueTypes = Array.from(new Set(supportedTypes));
    
    return `${sets.length} test cases for ${params.length} parameter(s) (${uniqueTypes.join(', ') || 'unsupported types'})`;
}