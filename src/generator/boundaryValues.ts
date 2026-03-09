/**
 * Boundary Value Analysis
 *
 * Provides boundary values for primitive C types, pointers, arrays, and structs.
 * Supports density-controlled generation:
 *   - minimal:    min, max, zero per parameter
 *   - standard:   min, min+1, typical, max-1, max  (default)
 *   - exhaustive: all boundary classes including near-zero, infinity, etc.
 */

import { FunctionParameter } from '../types';

// ---------------------------------------------------------------------------
// Public density type
// ---------------------------------------------------------------------------

export type TestDensity = 'minimal' | 'standard' | 'exhaustive';

// ---------------------------------------------------------------------------
// BoundaryValue interface
// ---------------------------------------------------------------------------

/**
 * Represents a single boundary value for a parameter.
 */
export interface BoundaryValue {
    /** Human-readable label (e.g., "minimum", "maximum") */
    label: string;

    /** C literal value (e.g., "INT_MIN", "0", "1.0f") */
    literal: string;

    /** Header file required (e.g., "climits") */
    requiresHeader?: string;
}

// ---------------------------------------------------------------------------
// BoundarySet interface
// ---------------------------------------------------------------------------

/**
 * Represents a complete test case with values for all parameters.
 */
export interface BoundarySet {
    /** Human-readable label for test name (e.g., "Param_a_Min") */
    label: string;

    /** Human-readable description */
    description: string;

    /** Array of C literal values (one per parameter, in order) — used for display */
    values: string[];

    /** Headers needed for this test case */
    requiredHeaders: string[];

    /**
     * Optional per-parameter preamble declarations (e.g., helper variable for a valid pointer).
     * Index matches the parameter index.  null = no preamble needed.
     */
    paramPreambles?: (string | null)[];

    /**
     * Optional per-parameter declaration overrides.
     * When non-null, replaces the default  `<type> <name> = <value>;`  line.
     * Index matches the parameter index.  null = use the default.
     */
    paramDeclarations?: (string | null)[];
}

// ---------------------------------------------------------------------------
// Boundary catalog for primitive types
// ---------------------------------------------------------------------------

const BOUNDARY_CATALOG: Record<string, BoundaryValue[]> = {
    'int': [
        { label: 'minimum',           literal: 'INT_MIN',          requiresHeader: 'climits' },
        { label: 'minimum-plus-one',  literal: '(INT_MIN + 1)',     requiresHeader: 'climits' },
        { label: 'typical',           literal: '1' },
        { label: 'maximum-minus-one', literal: '(INT_MAX - 1)',     requiresHeader: 'climits' },
        { label: 'maximum',           literal: 'INT_MAX',           requiresHeader: 'climits' },
        { label: 'zero',              literal: '0' },
        { label: 'overflow',          literal: 'INT_MAX',           requiresHeader: 'climits' },
    ],

    'unsigned int': [
        { label: 'minimum',           literal: '0' },
        { label: 'minimum-plus-one',  literal: '1' },
        { label: 'typical',           literal: '100u' },
        { label: 'maximum-minus-one', literal: '(UINT_MAX - 1)',    requiresHeader: 'climits' },
        { label: 'maximum',           literal: 'UINT_MAX',          requiresHeader: 'climits' },
        { label: 'zero',              literal: '0' },
    ],

    'long': [
        { label: 'minimum',           literal: 'LONG_MIN',          requiresHeader: 'climits' },
        { label: 'minimum-plus-one',  literal: '(LONG_MIN + 1)',    requiresHeader: 'climits' },
        { label: 'typical',           literal: '1L' },
        { label: 'maximum-minus-one', literal: '(LONG_MAX - 1)',    requiresHeader: 'climits' },
        { label: 'maximum',           literal: 'LONG_MAX',          requiresHeader: 'climits' },
        { label: 'zero',              literal: '0L' },
    ],

    'unsigned long': [
        { label: 'minimum',           literal: '0UL' },
        { label: 'minimum-plus-one',  literal: '1UL' },
        { label: 'typical',           literal: '100UL' },
        { label: 'maximum-minus-one', literal: '(ULONG_MAX - 1)',   requiresHeader: 'climits' },
        { label: 'maximum',           literal: 'ULONG_MAX',         requiresHeader: 'climits' },
        { label: 'zero',              literal: '0UL' },
    ],

    'short': [
        { label: 'minimum',           literal: 'SHRT_MIN',          requiresHeader: 'climits' },
        { label: 'minimum-plus-one',  literal: '(SHRT_MIN + 1)',    requiresHeader: 'climits' },
        { label: 'typical',           literal: '1' },
        { label: 'maximum-minus-one', literal: '(SHRT_MAX - 1)',    requiresHeader: 'climits' },
        { label: 'maximum',           literal: 'SHRT_MAX',          requiresHeader: 'climits' },
        { label: 'zero',              literal: '0' },
    ],

    'unsigned short': [
        { label: 'minimum',           literal: '0' },
        { label: 'minimum-plus-one',  literal: '1' },
        { label: 'typical',           literal: '100' },
        { label: 'maximum-minus-one', literal: '(USHRT_MAX - 1)',   requiresHeader: 'climits' },
        { label: 'maximum',           literal: 'USHRT_MAX',         requiresHeader: 'climits' },
        { label: 'zero',              literal: '0' },
    ],

    'char': [
        { label: 'minimum',           literal: 'CHAR_MIN',          requiresHeader: 'climits' },
        { label: 'minimum-plus-one',  literal: '(CHAR_MIN + 1)',    requiresHeader: 'climits' },
        { label: 'null-terminator',   literal: "'\\0'" },
        { label: 'printable',         literal: "'A'" },
        { label: 'maximum-minus-one', literal: '(CHAR_MAX - 1)',    requiresHeader: 'climits' },
        { label: 'maximum',           literal: 'CHAR_MAX',          requiresHeader: 'climits' },
        { label: 'zero',              literal: "'\\0'" },
    ],

    'unsigned char': [
        { label: 'minimum',           literal: '0' },
        { label: 'minimum-plus-one',  literal: '1' },
        { label: 'typical',           literal: '65' },
        { label: 'maximum-minus-one', literal: '(UCHAR_MAX - 1)',   requiresHeader: 'climits' },
        { label: 'maximum',           literal: 'UCHAR_MAX',         requiresHeader: 'climits' },
        { label: 'zero',              literal: '0' },
    ],

    'float': [
        { label: 'minimum',               literal: '-FLT_MAX',                requiresHeader: 'cfloat' },
        { label: 'minimum-plus-epsilon',  literal: '(-FLT_MAX + FLT_EPSILON)', requiresHeader: 'cfloat' },
        { label: 'typical',               literal: '1.0f' },
        { label: 'maximum-minus-epsilon', literal: '(FLT_MAX - FLT_EPSILON)',  requiresHeader: 'cfloat' },
        { label: 'maximum',               literal: 'FLT_MAX',                 requiresHeader: 'cfloat' },
        { label: 'zero',                  literal: '0.0f' },
        { label: 'near-zero-positive',    literal: 'FLT_EPSILON',             requiresHeader: 'cfloat' },
        { label: 'near-zero-negative',    literal: '-FLT_EPSILON',            requiresHeader: 'cfloat' },
        { label: 'positive-infinity',     literal: 'std::numeric_limits<float>::infinity()',   requiresHeader: 'limits' },
        { label: 'negative-infinity',     literal: '-std::numeric_limits<float>::infinity()',  requiresHeader: 'limits' },
    ],

    'double': [
        { label: 'minimum',               literal: '-DBL_MAX',                requiresHeader: 'cfloat' },
        { label: 'minimum-plus-epsilon',  literal: '(-DBL_MAX + DBL_EPSILON)', requiresHeader: 'cfloat' },
        { label: 'typical',               literal: '1.0' },
        { label: 'maximum-minus-epsilon', literal: '(DBL_MAX - DBL_EPSILON)',  requiresHeader: 'cfloat' },
        { label: 'maximum',               literal: 'DBL_MAX',                 requiresHeader: 'cfloat' },
        { label: 'zero',                  literal: '0.0' },
        { label: 'near-zero-positive',    literal: 'DBL_EPSILON',             requiresHeader: 'cfloat' },
        { label: 'near-zero-negative',    literal: '-DBL_EPSILON',            requiresHeader: 'cfloat' },
        { label: 'positive-infinity',     literal: 'std::numeric_limits<double>::infinity()',  requiresHeader: 'limits' },
        { label: 'negative-infinity',     literal: '-std::numeric_limits<double>::infinity()', requiresHeader: 'limits' },
    ],

    'size_t': [
        { label: 'minimum',          literal: '0',         requiresHeader: 'cstddef' },
        { label: 'minimum-plus-one', literal: '1',         requiresHeader: 'cstddef' },
        { label: 'typical',          literal: '10' },
        { label: 'maximum',          literal: 'SIZE_MAX',  requiresHeader: 'cstddef' },
        { label: 'zero',             literal: '0' },
    ],
};

// ---------------------------------------------------------------------------
// Boundary classes per density level
// ---------------------------------------------------------------------------

const MINIMAL_CLASSES    = ['minimum', 'maximum', 'zero'];
const STANDARD_CLASSES   = ['minimum', 'minimum-plus-one', 'maximum-minus-one', 'maximum'];
const EXHAUSTIVE_CLASSES = [
    'minimum', 'minimum-plus-one', 'minimum-plus-epsilon',
    'null-terminator', 'printable',
    'near-zero-negative', 'zero', 'near-zero-positive',
    'typical',
    'maximum-minus-epsilon', 'maximum-minus-one', 'maximum',
    'positive-infinity', 'negative-infinity', 'overflow',
];

function getBoundaryClassesForDensity(density: TestDensity): string[] {
    if (density === 'minimal')    { return MINIMAL_CLASSES; }
    if (density === 'exhaustive') { return EXHAUSTIVE_CLASSES; }
    return STANDARD_CLASSES;
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function normalizeType(type: string): string {
    return type.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getNominalValue(type: string): string {
    const normalized = normalizeType(type);
    const boundaries = BOUNDARY_CATALOG[normalized];
    if (boundaries) {
        const zero = boundaries.find(b => b.label === 'zero');
        if (zero) { return zero.literal; }
    }
    return '0';
}

export function getSafeDefaultForType(type: string): string {
    const normalized = normalizeType(type);
    if (normalized.includes('float'))    { return '1.0f'; }
    if (normalized.includes('double'))   { return '1.0'; }
    if (normalized.includes('char'))     { return "'a'"; }
    if (normalized.includes('unsigned')) { return '10'; }
    return '10';
}

export function isPointerType(type: string): boolean {
    return type.includes('*');
}

export function isArrayType(type: string): boolean {
    return type.includes('[');
}

export function isStructType(type: string): boolean {
    return normalizeType(type).startsWith('struct ');
}

export function isSupportedType(type: string): boolean {
    return normalizeType(type) in BOUNDARY_CATALOG;
}

export function getBoundaryValues(type: string): BoundaryValue[] {
    return BOUNDARY_CATALOG[normalizeType(type)] || [];
}

export function getBoundariesForType(type: string): BoundaryValue[] {
    return getBoundaryValues(type);
}

function sanitizeBoundaryLabel(label: string): string {
    return label
        .replace(/minimum-plus-one/g,      'MinPlusOne')
        .replace(/minimum-plus-epsilon/g,   'MinPlusEpsilon')
        .replace(/maximum-minus-one/g,      'MaxMinusOne')
        .replace(/maximum-minus-epsilon/g,  'MaxMinusEpsilon')
        .replace(/null-terminator/g,        'NullTerm')
        .replace(/near-zero-positive/g,     'NearZeroPos')
        .replace(/near-zero-negative/g,     'NearZeroNeg')
        .replace(/positive-infinity/g,      'PosInf')
        .replace(/negative-infinity/g,      'NegInf')
        .replace(/array-single-element/g,   'ArraySingle')
        .replace(/array-typical/g,          'ArrayTypical')
        .replace(/struct-zero-init/g,       'StructZero')
        .replace(/struct-extreme-values/g,  'StructExtreme')
        .replace(/minimum/g,  'Min')
        .replace(/maximum/g,  'Max')
        .replace(/typical/g,  'Typical')
        .replace(/overflow/g, 'Overflow')
        .replace(/printable/g,'Printable')
        .replace(/zero/g,     'Zero')
        .replace(/-/g, '_');
}

// ---------------------------------------------------------------------------
// Pointer / array / struct boundary helpers
// ---------------------------------------------------------------------------

function pointerBaseType(type: string): string {
    return type.replace(/\s*\*+\s*$/, '').trim();
}

function arrayBaseType(type: string): { base: string; size: string | null } {
    const match = type.match(/^(.+?)\[(\d*)\]$/);
    if (!match) { return { base: type, size: null }; }
    return { base: match[1].trim(), size: match[2] || null };
}

interface ComplexEntry {
    label: string;
    value: string;
    declaration: string;
    preamble: string | null;
    headers: string[];
}

function pointerEntriesForParam(param: FunctionParameter): ComplexEntry[] {
    const base = pointerBaseType(param.type);
    const defaultVal = getNominalValue(base) || getSafeDefaultForType(base);

    return [
        {
            label: 'null-pointer',
            value: 'NULL',
            declaration: `${param.type} ${param.name} = NULL`,
            preamble: null,
            headers: ['cstddef'],
        },
        {
            label: 'valid-pointer',
            value: `&${param.name}_val`,
            declaration: `${param.type} ${param.name} = &${param.name}_val`,
            preamble: `${base} ${param.name}_val = ${defaultVal}`,
            headers: [],
        },
    ];
}

function arrayEntriesForParam(param: FunctionParameter): ComplexEntry[] {
    const { base, size } = arrayBaseType(param.type);
    const zero = getNominalValue(base) || '0';
    const typicalSize = size || '10';

    return [
        {
            label: 'array-single-element',
            value: `{${zero}}`,
            declaration: `${base} ${param.name}[1] = {${zero}}`,
            preamble: null,
            headers: [],
        },
        {
            label: 'array-typical',
            value: '{0}',
            declaration: `${base} ${param.name}[${typicalSize}] = {0}`,
            preamble: null,
            headers: [],
        },
    ];
}

function structEntriesForParam(param: FunctionParameter): ComplexEntry[] {
    return [
        {
            label: 'struct-zero-init',
            value: '{0}',
            declaration: `${param.type} ${param.name} = {0}`,
            preamble: null,
            headers: [],
        },
        {
            // NOTE: extreme-values initializer assumes integer fields.
            // For structs with float/double/pointer fields this may need manual adjustment.
            label: 'struct-extreme-values',
            value: '{INT_MAX, INT_MAX}',
            declaration: `${param.type} ${param.name} = {INT_MAX, INT_MAX}`,
            preamble: null,
            headers: ['climits'],
        },
    ];
}

// ---------------------------------------------------------------------------
// Nominal entry helper used inside generateBoundarySets
// ---------------------------------------------------------------------------

interface NominalEntry {
    value: string;
    declaration: string | null;
    preamble: string | null;
    headers: string[];
}

function getNominalEntry(p: FunctionParameter): NominalEntry {
    if (isPointerType(p.type)) {
        return {
            value: 'NULL',
            declaration: `${p.type} ${p.name} = NULL`,
            preamble: null,
            headers: ['cstddef'],
        };
    }
    if (isArrayType(p.type)) {
        const entry = arrayEntriesForParam(p)[0];
        return {
            value: entry.value,
            declaration: entry.declaration,
            preamble: entry.preamble,
            headers: entry.headers,
        };
    }
    if (isStructType(p.type)) {
        const entry = structEntriesForParam(p)[0];
        return {
            value: entry.value,
            declaration: entry.declaration,
            preamble: entry.preamble,
            headers: entry.headers,
        };
    }
    return {
        value: getNominalValue(p.type),
        declaration: null,
        preamble: null,
        headers: [],
    };
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

/**
 * Generates boundary value analysis test sets for a function's parameters.
 *
 * Strategy:
 * 1. One baseline test  (all nominal/zero)
 * 2. One-at-a-time boundary tests  (vary each param individually)
 * 3. Critical combination tests  (all-min, all-max, all-typical, mixed)
 *
 * @param params   Function parameters
 * @param density  Controls how many boundary classes are exercised
 */
export function generateBoundarySets(
    params: FunctionParameter[],
    density: TestDensity = 'standard'
): BoundarySet[] {
    if (params.length === 0) {
        return [{
            label: 'NoParams',
            description: 'Function with no parameters',
            values: [],
            requiredHeaders: [],
        }];
    }

    const sets: BoundarySet[] = [];
    const boundaryClasses = getBoundaryClassesForDensity(density);

    // ------------------------------------------------------------------
    // 1. BASELINE TEST (all nominal/zero)
    // ------------------------------------------------------------------
    {
        const values: string[] = [];
        const requiredHeaders = new Set<string>();
        const paramPreambles: (string | null)[] = [];
        const paramDeclarations: (string | null)[] = [];

        for (const param of params) {
            const entry = getNominalEntry(param);
            values.push(entry.value);
            entry.headers.forEach(h => requiredHeaders.add(h));
            paramPreambles.push(entry.preamble);
            paramDeclarations.push(entry.declaration);
        }

        sets.push({
            label: 'Baseline_AllZero',
            description: 'Baseline test with all parameters at zero/nominal',
            values,
            requiredHeaders: Array.from(requiredHeaders),
            paramPreambles,
            paramDeclarations,
        });
    }

    // ------------------------------------------------------------------
    // 2. ONE-AT-A-TIME BOUNDARY TESTS
    // ------------------------------------------------------------------
    for (let paramIndex = 0; paramIndex < params.length; paramIndex++) {
        const param = params[paramIndex];

        // ---- Pointer ----
        if (isPointerType(param.type)) {
            for (const entry of pointerEntriesForParam(param)) {
                const values: string[] = [];
                const headers = new Set<string>();
                const preambles: (string | null)[] = [];
                const declarations: (string | null)[] = [];
                entry.headers.forEach(h => headers.add(h));

                for (let i = 0; i < params.length; i++) {
                    if (i === paramIndex) {
                        values.push(entry.value);
                        preambles.push(entry.preamble);
                        declarations.push(entry.declaration);
                    } else {
                        const nom = getNominalEntry(params[i]);
                        values.push(nom.value);
                        preambles.push(nom.preamble);
                        declarations.push(nom.declaration);
                        nom.headers.forEach(h => headers.add(h));
                    }
                }
                sets.push({
                    label: `Param_${param.name}_${sanitizeBoundaryLabel(entry.label)}`,
                    description: `${param.name} = ${entry.label}, others at nominal`,
                    values,
                    requiredHeaders: Array.from(headers),
                    paramPreambles: preambles,
                    paramDeclarations: declarations,
                });
            }
            continue;
        }

        // ---- Array ----
        if (isArrayType(param.type)) {
            for (const entry of arrayEntriesForParam(param)) {
                const values: string[] = [];
                const headers = new Set<string>();
                const preambles: (string | null)[] = [];
                const declarations: (string | null)[] = [];

                for (let i = 0; i < params.length; i++) {
                    if (i === paramIndex) {
                        values.push(entry.value);
                        preambles.push(entry.preamble);
                        declarations.push(entry.declaration);
                        entry.headers.forEach(h => headers.add(h));
                    } else {
                        const nom = getNominalEntry(params[i]);
                        values.push(nom.value);
                        preambles.push(nom.preamble);
                        declarations.push(nom.declaration);
                        nom.headers.forEach(h => headers.add(h));
                    }
                }
                sets.push({
                    label: `Param_${param.name}_${sanitizeBoundaryLabel(entry.label)}`,
                    description: `${param.name} = ${entry.label}, others at nominal`,
                    values,
                    requiredHeaders: Array.from(headers),
                    paramPreambles: preambles,
                    paramDeclarations: declarations,
                });
            }
            continue;
        }

        // ---- Struct ----
        if (isStructType(param.type)) {
            for (const entry of structEntriesForParam(param)) {
                const values: string[] = [];
                const headers = new Set<string>();
                const preambles: (string | null)[] = [];
                const declarations: (string | null)[] = [];

                for (let i = 0; i < params.length; i++) {
                    if (i === paramIndex) {
                        values.push(entry.value);
                        preambles.push(entry.preamble);
                        declarations.push(entry.declaration);
                        entry.headers.forEach(h => headers.add(h));
                    } else {
                        const nom = getNominalEntry(params[i]);
                        values.push(nom.value);
                        preambles.push(nom.preamble);
                        declarations.push(nom.declaration);
                        nom.headers.forEach(h => headers.add(h));
                    }
                }
                sets.push({
                    label: `Param_${param.name}_${sanitizeBoundaryLabel(entry.label)}`,
                    description: `${param.name} = ${entry.label}, others at nominal`,
                    values,
                    requiredHeaders: Array.from(headers),
                    paramPreambles: preambles,
                    paramDeclarations: declarations,
                });
            }
            continue;
        }

        // ---- Primitive ----
        const allBoundaries = getBoundaryValues(param.type);
        if (allBoundaries.length === 0) { continue; }

        for (const boundaryClass of boundaryClasses) {
            const boundary = allBoundaries.find(b => b.label === boundaryClass);
            if (!boundary) { continue; }

            const values: string[] = [];
            const headers = new Set<string>();
            const preambles: (string | null)[] = [];
            const declarations: (string | null)[] = [];

            for (let i = 0; i < params.length; i++) {
                if (i === paramIndex) {
                    values.push(boundary.literal);
                    if (boundary.requiresHeader) { headers.add(boundary.requiresHeader); }
                    preambles.push(null);
                    declarations.push(null);
                } else {
                    const nom = getNominalEntry(params[i]);
                    values.push(nom.value);
                    preambles.push(nom.preamble);
                    declarations.push(nom.declaration);
                    nom.headers.forEach(h => headers.add(h));
                }
            }

            sets.push({
                label: `Param_${param.name}_${sanitizeBoundaryLabel(boundaryClass)}`,
                description: `Vary ${param.name} to ${boundaryClass}, others at zero`,
                values,
                requiredHeaders: Array.from(headers),
                paramPreambles: preambles,
                paramDeclarations: declarations,
            });
        }
    }

    // ------------------------------------------------------------------
    // 3. COMBINATION TESTS
    // ------------------------------------------------------------------
    const comboPairs: Array<{ label: string; boundary: string }> = [
        { label: 'AllMin',     boundary: 'minimum' },
        { label: 'AllMax',     boundary: 'maximum' },
    ];
    if (density !== 'minimal') {
        comboPairs.push({ label: 'AllTypical', boundary: 'typical' });
    }

    for (const combo of comboPairs) {
        const values: string[] = [];
        const headers = new Set<string>();
        const preambles: (string | null)[] = [];
        const declarations: (string | null)[] = [];

        for (const param of params) {
            if (isPointerType(param.type) || isArrayType(param.type) || isStructType(param.type)) {
                const nom = getNominalEntry(param);
                values.push(nom.value);
                preambles.push(nom.preamble);
                declarations.push(nom.declaration);
                nom.headers.forEach(h => headers.add(h));
            } else {
                const boundaries = getBoundaryValues(param.type);
                const bv = boundaries.find(b => b.label === combo.boundary);
                if (bv) {
                    values.push(bv.literal);
                    if (bv.requiresHeader) { headers.add(bv.requiresHeader); }
                    preambles.push(null);
                    declarations.push(null);
                } else {
                    const nom = getNominalEntry(param);
                    values.push(nom.value);
                    preambles.push(nom.preamble);
                    declarations.push(nom.declaration);
                }
            }
        }

        sets.push({
            label: `Combination_${combo.label}`,
            description: `All parameters at ${combo.label.replace('All', '').toLowerCase()}`,
            values,
            requiredHeaders: Array.from(headers),
            paramPreambles: preambles,
            paramDeclarations: declarations,
        });
    }

    // Mixed min/max combo (standard + exhaustive, >1 primitive param)
    if (density !== 'minimal') {
        const primitiveCount = params.filter(
            p => !isPointerType(p.type) && !isArrayType(p.type) && !isStructType(p.type) && isSupportedType(p.type)
        ).length;

        if (primitiveCount > 1) {
            const values: string[] = [];
            const headers = new Set<string>();
            const preambles: (string | null)[] = [];
            const declarations: (string | null)[] = [];
            let primitiveIdx = 0;

            for (const param of params) {
                if (isPointerType(param.type) || isArrayType(param.type) || isStructType(param.type)) {
                    const nom = getNominalEntry(param);
                    values.push(nom.value);
                    preambles.push(nom.preamble);
                    declarations.push(nom.declaration);
                    nom.headers.forEach(h => headers.add(h));
                } else {
                    const boundaries = getBoundaryValues(param.type);
                    const useMin = (primitiveIdx % 2 === 0);
                    const bv = boundaries.find(b => b.label === (useMin ? 'minimum' : 'maximum'));
                    if (bv) {
                        values.push(bv.literal);
                        if (bv.requiresHeader) { headers.add(bv.requiresHeader); }
                    } else {
                        values.push(getNominalValue(param.type));
                    }
                    preambles.push(null);
                    declarations.push(null);
                    primitiveIdx++;
                }
            }

            sets.push({
                label: 'Combination_MixedMinMax',
                description: 'Alternating min/max values across parameters',
                values,
                requiredHeaders: Array.from(headers),
                paramPreambles: preambles,
                paramDeclarations: declarations,
            });
        }
    }

    return sets;
}

// ---------------------------------------------------------------------------
// Summary helper
// ---------------------------------------------------------------------------

export function getBoundarySummary(
    params: FunctionParameter[],
    density: TestDensity = 'standard'
): string {
    const sets = generateBoundarySets(params, density);
    const typeList = params.map(p => normalizeType(p.type));
    const uniqueTypes = Array.from(new Set(typeList));
    return `${sets.length} test cases for ${params.length} parameter(s) (${uniqueTypes.join(', ') || 'none'})`;
}
