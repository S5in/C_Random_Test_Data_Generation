/**
 * Boundary Value Analysis
 *
 * Provides boundary values for primitive C types, pointers, arrays, and structs.
 * Supports density-controlled generation:
 *   - minimal:    min, max, zero per parameter
 *   - standard:   min, min+1, max-1, max, +Infinity, -Infinity, NaN  (default)
 *   - exhaustive: all boundary classes including near-zero, epsilon, etc.
 */

import { FunctionParameter, StructInfo } from '../types';
// ---------------------------------------------------------------------------
// Known struct names (for typedef'd struct support)
// ---------------------------------------------------------------------------
let knownStructNames: Set<string> = new Set();
let knownStructInfos: StructInfo[] = [];
/**
 * Register typedef'd and named struct names so that isStructType() recognises
 * them even when the parameter type does not carry the "struct " prefix.
 *  * Also stores the full StructInfo for field-count-aware initializer generation.
 */
export function setKnownStructNames(names: string[]): void {
    knownStructNames = new Set(names.map(n => n.toLowerCase()));
}
/**
 * Store the full struct definitions so that structEntriesForParam() can produce
 * field-count-aware initializers even when structs are not threaded through the
 * call chain explicitly (e.g., from TestGenerator).
 */
export function setKnownStructInfos(structs: StructInfo[]): void {
    knownStructInfos = structs;
}

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

    /**
     * Optional note emitted as a comment before the Assert section.
     * Using for documenting edge cases (e.g., overflow, UB).
     */
    testNote?: string;

    /**
     * When true, no FAIL()/EXPECT assertion is emitted.
     * The function is called but the result is only stored (no check).
     * Using for documenting tests that exercise undefined behavior.
     */
    noAssertion?: boolean;

    /**
     * When set, the test body emits GTEST_SKIP() with this message instead of
     * calling the function.  The Arrange section is still emitted so the reader
     * can see the inputs that would trigger the UB.
     */
    skipReason?: string;

        /**
     * When true, the result is likely to be NaN or ±Inf due to arithmetic
     * overflow from extreme boundary inputs (e.g., FLT_MAX * FLT_MAX).
     * emitAssert() uses a permissive EXPECT_TRUE(std::isnan || std::isinf)
     * instead of FAIL().
     */
    expectsOverflow?: boolean;
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
        { label: 'negative-zero',         literal: '-0.0f' },
        { label: 'near-zero-positive',    literal: 'FLT_EPSILON',             requiresHeader: 'cfloat' },
        { label: 'near-zero-negative',    literal: '-FLT_EPSILON',            requiresHeader: 'cfloat' },
        { label: 'smallest-positive',     literal: 'FLT_MIN',                 requiresHeader: 'cfloat' },
        { label: 'positive-infinity',     literal: 'INFINITY',                requiresHeader: 'cmath' },
        { label: 'negative-infinity',     literal: '-INFINITY',               requiresHeader: 'cmath' },
        { label: 'nan',                   literal: 'NAN',                     requiresHeader: 'cmath' },
    ],

    'double': [
        { label: 'minimum',               literal: '-DBL_MAX',                requiresHeader: 'cfloat' },
        { label: 'minimum-plus-epsilon',  literal: '(-DBL_MAX + DBL_EPSILON)', requiresHeader: 'cfloat' },
        { label: 'typical',               literal: '1.0' },
        { label: 'maximum-minus-epsilon', literal: '(DBL_MAX - DBL_EPSILON)',  requiresHeader: 'cfloat' },
        { label: 'maximum',               literal: 'DBL_MAX',                 requiresHeader: 'cfloat' },
        { label: 'zero',                  literal: '0.0' },
        { label: 'negative-zero',         literal: '-0.0' },
        { label: 'near-zero-positive',    literal: 'DBL_EPSILON',             requiresHeader: 'cfloat' },
        { label: 'near-zero-negative',    literal: '-DBL_EPSILON',            requiresHeader: 'cfloat' },
        { label: 'smallest-positive',     literal: 'DBL_MIN',                 requiresHeader: 'cfloat' },
        { label: 'positive-infinity',     literal: 'INFINITY',                requiresHeader: 'cmath' },
        { label: 'negative-infinity',     literal: '-INFINITY',               requiresHeader: 'cmath' },
        { label: 'nan',                   literal: 'NAN',                     requiresHeader: 'cmath' },
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

const MINIMAL_CLASSES    = ['minimum', 'maximum', 'zero', 'positive-infinity', 'negative-infinity', 'nan'];
const STANDARD_CLASSES   = ['minimum', 'minimum-plus-one', 'maximum-minus-one', 'maximum', 'positive-infinity', 'negative-infinity', 'nan'];
const EXHAUSTIVE_CLASSES = [
    'minimum', 'minimum-plus-one', 'minimum-plus-epsilon',
    'null-terminator', 'printable',
    'near-zero-negative', 'zero', 'negative-zero', 'near-zero-positive',
    'typical',
    'smallest-positive',
    'maximum-minus-epsilon', 'maximum-minus-one', 'maximum',
    'positive-infinity', 'negative-infinity', 'nan', 'overflow',
];

const DEFAULT_STRUCT_FIELD_COUNT = 2;

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
    const normalized = normalizeType(type);
    if (normalized.startsWith('struct ')) { return true; }
    return knownStructNames.has(normalized);
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

/**
 * Returns true if the given C literal is an infinity or NaN macro.
 * Used by the test generator to annotate assertions appropriately.
 * Handles common variants: nan, nanf, nanl, inf, inff, infl, -infinity, etc.
 */
export function isFloatSpecialValue(literal: string): boolean {
    const v = literal.trim();
    return /^[+-]?\s*nan[fl]?$/i.test(v) ||
           /^[+-]?\s*inf(?:inity)?[fl]?$/i.test(v);
}

/**
 * Returns true if the given C literal represents a negative finite floating-point
 * value — e.g. `-FLT_MAX`, `-DBL_MAX`, `-FLT_EPSILON`, `(-FLT_MAX + FLT_EPSILON)`.
 * Returns false for `-0.0`, `-0.0f`, `-INFINITY`, `-NAN`, and all non-negative values.
 * Used by the test generator to detect likely domain violations (e.g. sqrt of a
 * negative number).
 */
export function isNegativeFiniteFloat(literal: string): boolean {
    const v = literal.trim();
    if (v.startsWith('-')) {
        // Exclude -0.0 / -0.0f
        if (/^-\s*0\.0f?\s*$/.test(v)) { return false; }
        // Exclude -INFINITY variants
        if (/^-\s*inf(?:inity)?[fl]?$/i.test(v)) { return false; }
        // Exclude -NAN variants
        if (/^-\s*nan[fl]?$/i.test(v)) { return false; }
        return true;
    }
    // Parenthesized expressions generated by the boundary catalog:
    // (-FLT_MAX + FLT_EPSILON)  and  (-DBL_MAX + DBL_EPSILON).
    if (v === '(-FLT_MAX + FLT_EPSILON)' || v === '(-DBL_MAX + DBL_EPSILON)') {
        return true;
    }
    return false;
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
        .replace(/negative-zero/g,          'NegZero')
        .replace(/smallest-positive/g,      'SmallestPos')
        .replace(/positive-infinity/g,      'PosInf')
        .replace(/negative-infinity/g,      'NegInf')
        .replace(/array-size-zero/g,           'ArraySizeZero')
        .replace(/array-single-intmax/g,       'ArrayIntMax')
        .replace(/array-single-intmin/g,       'ArrayIntMin')
        .replace(/array-single-positive/g,     'ArraySinglePos')
        .replace(/array-typical-ascending/g,   'ArrayAscending')
        .replace(/array-typical-negative/g,    'ArrayNegative')
        .replace(/array-typical-mixed/g,       'ArrayMixed')
        .replace(/array-size-exceeds-length/g, 'ArraySizeExceeds')
        .replace(/array-negative-size/g,       'ArrayNegSize')
        .replace(/array-extreme-pair/g,        'ArrayExtremePair')
        .replace(/array-single-element/g,      'ArraySingle')
        .replace(/array-typical/g,             'ArrayTypical')
        .replace(/struct-zero-init/g,          'StructZero')
        .replace(/struct-min-values/g,         'StructMin')
        .replace(/struct-extreme-values/g,  'StructExtreme')
        .replace(/null-pointer/g,           'NullPointer')
        .replace(/pointer-to-zero/g,        'PointerToZero')
        .replace(/pointer-to-min/g,         'PointerToMin')
        .replace(/pointer-to-max/g,         'PointerToMax')
        .replace(/pointer-to-typical/g,     'PointerToTypical')
        .replace(/valid-pointer/g,          'ValidPointer')
        .replace(/minimum/g,  'Min')
        .replace(/maximum/g,  'Max')
        .replace(/typical/g,  'Typical')
        .replace(/overflow/g, 'Overflow')
        .replace(/printable/g,'Printable')
        .replace(/\bnan\b/g,  'NaN')
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
    /** For array entries: the correlated size parameter value */
    pairedSizeValue?: string;
}

function pointerEntriesForParam(param: FunctionParameter): ComplexEntry[] {
    const base = pointerBaseType(param.type);
    const boundaries = getBoundaryValues(base);

    const entries: ComplexEntry[] = [
        {
            label: 'null-pointer',
            value: 'NULL',
            declaration: `${param.type} ${param.name} = NULL`,
            preamble: null,
            headers: ['cstddef'],
        },
    ];

    // Pick a representative subset of boundary values for the pointed-to data
    const picks: { label: string; boundaryLabel: string }[] = [
        { label: 'pointer-to-zero',    boundaryLabel: 'zero' },
        { label: 'pointer-to-min',     boundaryLabel: 'minimum' },
        { label: 'pointer-to-max',     boundaryLabel: 'maximum' },
        { label: 'pointer-to-typical', boundaryLabel: 'typical' },
    ];

    for (const pick of picks) {
        const bv = boundaries.find(b => b.label === pick.boundaryLabel);
        if (bv) {
            entries.push({
                label: pick.label,
                value: `&${param.name}_val`,
                declaration: `${param.type} ${param.name} = &${param.name}_val`,
                preamble: `${base} ${param.name}_val = ${bv.literal}`,
                headers: bv.requiresHeader ? [bv.requiresHeader] : [],
            });
        }
    }

    // Fallback: if no boundary values matched (unsupported base type), add one valid-pointer
    if (entries.length === 1) {
        const defaultVal = getSafeDefaultForType(base);
        entries.push({
            label: 'valid-pointer',
            value: `&${param.name}_val`,
            declaration: `${param.type} ${param.name} = &${param.name}_val`,
            preamble: `${base} ${param.name}_val = ${defaultVal}`,
            headers: [],
        });
    }

    return entries;
}

/**
 * Returns max-value array content for a given base type, for use in AllMax combos.
 */
function makeMaxArrayContent(base: string): { content: string; headers: string[] } {
    const n = normalizeType(base);
    if (n === 'int' || n === 'long' || n === 'short' || n === 'signed int') {
        return { content: 'INT_MAX', headers: ['climits'] };
    }
    if (n === 'unsigned int' || n === 'unsigned') {
        return { content: 'UINT_MAX', headers: ['climits'] };
    }
    if (n === 'unsigned long') { return { content: 'ULONG_MAX', headers: ['climits'] }; }
    if (n === 'unsigned short') { return { content: 'USHRT_MAX', headers: ['climits'] }; }
    if (n.includes('float'))  { return { content: 'FLT_MAX',  headers: ['cfloat'] }; }
    if (n.includes('double')) { return { content: 'DBL_MAX',  headers: ['cfloat'] }; }
    return { content: makeAscendingArrayContent(3, base), headers: [] };
}

/**
 * Compute the (content, size, headers) for a paired-array parameter in a combo test.
 */
function makeComboArrayInfo(
    base: string,
    boundary: string
): { content: string; size: number; headers: string[] } {
    if (boundary === 'maximum') {
        const max = makeMaxArrayContent(base);
        return { content: max.content, size: 1, headers: max.headers };
    }
    if (boundary === 'minimum') {
        return { content: '1', size: 1, headers: [] };
    }
    // typical / fallback
    return { content: makeAscendingArrayContent(3, base), size: 3, headers: [] };
}

/**
 * Create a canonical key for a BoundarySet used to detect duplicates.
 */
function getBoundarySetKey(set: BoundarySet): string {
    const parts: string[] = [];
    const n = set.values.length;
    for (let i = 0; i < n; i++) {
        const decl = set.paramDeclarations?.[i];
        parts.push((decl !== undefined && decl !== null) ? decl : set.values[i]);
    }
    return parts.join('||');
}

/**
 * Generate an ascending array initializer content string, e.g. "1, 2, 3" for size=3.
 */
function makeAscendingArrayContent(size: number, base: string): string {
    if (size <= 0) { return '1'; }
    const normalized = normalizeType(base);
    const isFloat = normalized.includes('float') || normalized.includes('double');
    return Array.from({ length: size }, (_, i) => isFloat ? `${i + 1}.0` : `${i + 1}`).join(', ');
}

function arrayEntriesForParam(param: FunctionParameter): ComplexEntry[] {
    const { base } = arrayBaseType(param.type);
    const normalized = normalizeType(base);
    const isUnsigned = normalized.includes('unsigned');
    const isFloat    = normalized.includes('float') || normalized.includes('double');
    const isChar     = normalized.includes('char');
    const isSigned   = !isUnsigned && !isFloat && !isChar;
    const needsLimits = isSigned;

    const entries: ComplexEntry[] = [];

    // size=0 — loop never executes, result always 0 regardless of content
    entries.push({
        label: 'array-size-zero',
        value: isFloat ? '{1.0}' : isChar ? "{'A'}" : '{1}',
        declaration: isFloat ? `${base} ${param.name}[1] = {1.0}`
                   : isChar  ? `${base} ${param.name}[1] = {'A'}`
                   :           `${base} ${param.name}[1] = {1}`,
        preamble: null,
        headers: [],
        pairedSizeValue: '0',
    });

    // size=1, single positive element
    const singlePos = isFloat ? '1.0' : isChar ? "'A'" : '1';
    entries.push({
        label: 'array-single-positive',
        value: `{${singlePos}}`,
        declaration: `${base} ${param.name}[1] = {${singlePos}}`,
        preamble: null,
        headers: [],
        pairedSizeValue: '1',
    });

    if (needsLimits) {
        // size=1, INT_MAX element
        entries.push({
            label: 'array-single-intmax',
            value: '{INT_MAX}',
            declaration: `${base} ${param.name}[1] = {INT_MAX}`,
            preamble: null,
            headers: ['climits'],
            pairedSizeValue: '1',
        });
        // size=1, INT_MIN element
        entries.push({
            label: 'array-single-intmin',
            value: '{INT_MIN}',
            declaration: `${base} ${param.name}[1] = {INT_MIN}`,
            preamble: null,
            headers: ['climits'],
            pairedSizeValue: '1',
        });
        // two elements with an extreme value (INT_MAX) — tests how the function handles large values in multi-element arrays
        entries.push({
            label: 'array-extreme-pair',
            value: '{INT_MAX, 1}',
            declaration: `${base} ${param.name}[2] = {INT_MAX, 1}`,
            preamble: null,
            headers: ['climits'],
            pairedSizeValue: '2',
        });
        // size=3, ascending positive {1,2,3}
        entries.push({
            label: 'array-typical-ascending',
            value: '{1, 2, 3}',
            declaration: `${base} ${param.name}[3] = {1, 2, 3}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '3',
        });
        // size=3, all negative {-1,-2,-3}
        entries.push({
            label: 'array-typical-negative',
            value: '{-1, -2, -3}',
            declaration: `${base} ${param.name}[3] = {-1, -2, -3}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '3',
        });
        // size=4, mixed {-1,1,-1,1}
        entries.push({
            label: 'array-typical-mixed',
            value: '{-1, 1, -1, 1}',
            declaration: `${base} ${param.name}[4] = {-1, 1, -1, 1}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '4',
        });
        // negative size — loop should not execute
        entries.push({
            label: 'array-negative-size',
            value: '{1}',
            declaration: `${base} ${param.name}[1] = {1}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '-1',
        });
        // size > array length — buffer over-read (UB, documents missing bounds check)
        entries.push({
            label: 'array-size-exceeds-length',
            value: '{1, 2}',
            declaration: `${base} ${param.name}[2] = {1, 2}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '5',
        });
    } else if (isFloat) {
        entries.push({
            label: 'array-typical-ascending',
            value: '{1.0, 2.0, 3.0}',
            declaration: `${base} ${param.name}[3] = {1.0, 2.0, 3.0}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '3',
        });
        entries.push({
            label: 'array-typical-negative',
            value: '{-1.0, -2.0, -3.0}',
            declaration: `${base} ${param.name}[3] = {-1.0, -2.0, -3.0}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '3',
        });
    } else if (isChar) {
        entries.push({
            label: 'array-typical-ascending',
            value: "{'A', 'B', 'C'}",
            declaration: `${base} ${param.name}[3] = {'A', 'B', 'C'}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '3',
        });
    } else {
        // unsigned int — no negatives
        entries.push({
            label: 'array-typical-ascending',
            value: '{1, 2, 3}',
            declaration: `${base} ${param.name}[3] = {1, 2, 3}`,
            preamble: null,
            headers: [],
            pairedSizeValue: '3',
        });
    }

    return entries;
}

function structEntriesForParam(param: FunctionParameter, structInfo?: StructInfo): ComplexEntry[] {
    // Default to 2 fields when structInfo is undefined (struct definition not available).
    // This matches the legacy hardcoded two-field initializer and is a safe fallback.
    const fieldCount = structInfo?.fields.length ?? DEFAULT_STRUCT_FIELD_COUNT;
    const zeroInit = Array(fieldCount).fill('0').join(', ');
    const minInit = Array(fieldCount).fill('INT_MIN').join(', ');
    const extremeInit = Array(fieldCount).fill('INT_MAX').join(', ');
    return [
        {
            label: 'struct-zero-init',
            value: `{${zeroInit}}`,
            declaration: `${param.type} ${param.name} = {${zeroInit}}`,
            preamble: null,
            headers: [],
            },
        {
            // INT_MIN in every field: exercises the minimum boundary.
            // Note: arithmetic like (INT_MIN - 1) or negation of INT_MIN causes
            // signed overflow (undefined behavior in C); the caller must handle
            // this carefully.  In two's complement, -INT_MIN wraps to INT_MIN.
            label: 'struct-min-values',
            value: `{${minInit}}`,
            declaration: `${param.type} ${param.name} = {${minInit}}`,
            preamble: null,
            headers: ['climits'],
        },
        {
            label: 'struct-extreme-values',
            value: `{${extremeInit}}`,
            declaration: `${param.type} ${param.name} = {${extremeInit}}`,
            preamble: null,
            headers: ['climits'],
        },
    ];
}
/**
 * Find the StructInfo for a given parameter type from a list of known structs.
 * Handles both "struct Foo" and typedef'd "Foo" style types.
 */
function findStructInfo(type: string, structs: StructInfo[] = []): StructInfo | undefined {
    const bareName = getStructBareName(type);
    // Look in the explicitly provided list first, then fall back to the module-level store
    return (structs.length > 0 ? structs : knownStructInfos).find(
        s => s.name.toLowerCase() === bareName
    );
}
/**
 * Return the bare struct name from a type string, lower-cased.
 * Strips the "struct " prefix if present.
 * e.g. "struct Point" → "point", "Point" → "point"
 */
export function getStructBareName(type: string): string {
    const normalized = normalizeType(type);
    return normalized.startsWith('struct ') ? normalized.slice('struct '.length).trim() : normalized;
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

function getNominalEntry(p: FunctionParameter, structs: StructInfo[] = []): NominalEntry {
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
        const entry = structEntriesForParam(p, findStructInfo(p.type, structs))[0];
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
// Array-size parameter pair detection
// ---------------------------------------------------------------------------

const SIZE_PARAM_NAMES = new Set([
    'size', 'len', 'length', 'n', 'count', 'num', 'sz',
    'nelem', 'nelems', 'num_elements', 'array_size', 'num_items',
]);

/**
 * Detect pairs of (array parameter, size parameter).
 * Returns a Map from array param index → size param index.
 */
export function detectArraySizePairs(params: FunctionParameter[]): Map<number, number> {
    const pairs = new Map<number, number>();
    const usedSizeIndices = new Set<number>();

    for (let i = 0; i < params.length; i++) {
        if (!isArrayType(params[i].type)) { continue; }

        for (let j = 0; j < params.length; j++) {
            if (i === j || usedSizeIndices.has(j)) { continue; }
            const name = params[j].name.toLowerCase();
            if (SIZE_PARAM_NAMES.has(name) &&
                !isArrayType(params[j].type) &&
                !isPointerType(params[j].type) &&
                !isStructType(params[j].type)) {
                pairs.set(i, j);
                usedSizeIndices.add(j);
                break;
            }
        }
    }

    return pairs;
}

interface ArraySizeBoundary {
    label: string;
    sizeValue: string;
    arraySize: number;
    /** C initializer content (without braces), e.g. "1, 2, 3" */
    arrayContent: string;
    arrayHeaders?: string[];
}

function getArraySizeBoundaries(): ArraySizeBoundary[] {
    return [
        { label: 'zero-length',    sizeValue: '0',  arraySize: 1, arrayContent: '1' },
        { label: 'single-element', sizeValue: '1',  arraySize: 1, arrayContent: '42' },
        { label: 'typical-length', sizeValue: '3',  arraySize: 3, arrayContent: '1, 2, 3' },
        { label: 'negative',       sizeValue: '-1', arraySize: 1, arrayContent: '1' },
    ];
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
    density: TestDensity = 'standard',
    structs: StructInfo[] = []
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

    // Detect array-size parameter pairs for correlated test generation
    const arraySizePairs = detectArraySizePairs(params);
    const sizeToArrayMap = new Map<number, number>();
    for (const [arrIdx, sizeIdx] of arraySizePairs) {
        sizeToArrayMap.set(sizeIdx, arrIdx);
    }

    // ------------------------------------------------------------------
    // 1. BASELINE TEST (all nominal/zero)
    // ------------------------------------------------------------------
    {
        const values: string[] = [];
        const requiredHeaders = new Set<string>();
        const paramPreambles: (string | null)[] = [];
        const paramDeclarations: (string | null)[] = [];

        for (const param of params) {
            const entry = getNominalEntry(param, structs);
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
                    // When float/double params are at extremes, arithmetic may overflow to ±Inf or NaN.
                    ...(hasFloatingExtreme(params, values)
                        ? { testNote: 'Extreme float/double values may cause overflow (Inf) or NaN',
                            expectsOverflow: true }
                        : {}),
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
                    } else if (arraySizePairs.get(paramIndex) === i) {
                        // Paired size param — use the correlated value from the array entry
                        values.push(entry.pairedSizeValue ?? '1');
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
                    label: `Param_${param.name}_${sanitizeBoundaryLabel(entry.label)}`,
                    description: `${param.name} = ${entry.label}, others at nominal`,
                    values,
                    requiredHeaders: Array.from(headers),
                    paramPreambles: preambles,
                    paramDeclarations: declarations,
                    ...(entry.label === 'array-size-exceeds-length' ? {
                        skipReason: 'Over-read UB — size exceeds array length; function has no bounds checking',
                    } : {}),
                });
            }
            continue;
        }

        // ---- Struct ----
        if (isStructType(param.type)) {
            for (const entry of structEntriesForParam(param, findStructInfo(param.type, structs))) {
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

        // ---- Paired size parameter (array-size correlation) ----
        if (sizeToArrayMap.has(paramIndex)) {
            const pairedArrayIdx = sizeToArrayMap.get(paramIndex)!;
            const arrayParam = params[pairedArrayIdx];
            const { base } = arrayBaseType(arrayParam.type);

            for (const sizeBoundary of getArraySizeBoundaries()) {
                const values: string[] = [];
                const headers = new Set<string>();
                const preambles: (string | null)[] = [];
                const declarations: (string | null)[] = [];

                for (let i = 0; i < params.length; i++) {
                    if (i === paramIndex) {
                        values.push(sizeBoundary.sizeValue);
                        preambles.push(null);
                        declarations.push(null);
                    } else if (i === pairedArrayIdx) {
                        const content = sizeBoundary.arrayContent;
                        values.push(`{${content}}`);
                        preambles.push(null);
                        declarations.push(`${base} ${arrayParam.name}[${sizeBoundary.arraySize}] = {${content}}`);
                        if (sizeBoundary.arrayHeaders) {
                            sizeBoundary.arrayHeaders.forEach(h => headers.add(h));
                        }
                    } else {
                        const nom = getNominalEntry(params[i]);
                        values.push(nom.value);
                        preambles.push(nom.preamble);
                        declarations.push(nom.declaration);
                        nom.headers.forEach(h => headers.add(h));
                    }
                }

                sets.push({
                    label: `Param_${param.name}_${sanitizeBoundaryLabel(sizeBoundary.label)}`,
                    description: `${param.name} = ${sizeBoundary.label}, array sized accordingly`,
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

        // Pre-compute paired-array info for this combo so size and content stay coordinated
        const comboArrInfo = new Map<number, { content: string; size: number; headers: string[] }>();
        for (const [arrIdx] of arraySizePairs) {
            const { base } = arrayBaseType(params[arrIdx].type);
            comboArrInfo.set(arrIdx, makeComboArrayInfo(base, combo.boundary));
        }

        for (let pIdx = 0; pIdx < params.length; pIdx++) {
            const param = params[pIdx];

            if (sizeToArrayMap.has(pIdx)) {
                // Paired size param — use value from pre-computed arr info
                const arrIdx = sizeToArrayMap.get(pIdx)!;
                const info = comboArrInfo.get(arrIdx)!;
                values.push(`${info.size}`);
                preambles.push(null);
                declarations.push(null);
            } else if (arraySizePairs.has(pIdx)) {
                // Paired array param — use pre-computed content
                const info = comboArrInfo.get(pIdx)!;
                const { base } = arrayBaseType(param.type);
                values.push(`{${info.content}}`);
                preambles.push(null);
                declarations.push(`${base} ${param.name}[${info.size}] = {${info.content}}`);
                info.headers.forEach(h => headers.add(h));
            } else if (isPointerType(param.type) || isArrayType(param.type) || isStructType(param.type)) {
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
            // When all float/double params are at same-sign extremes (min/max),
            // arithmetic often overflows to ±Inf or NaN (e.g. add(FLT_MAX, FLT_MAX) = Inf).
            // Some functions produce finite results (e.g. divide(FLT_MAX, FLT_MAX) = 1.0),
            // so we also emit a TODO comment so the webview can help users replace the
            // assertion with a more precise one if needed.
            ...(combo.boundary !== 'typical' && hasFloatingExtreme(params, values)
                ? { testNote: 'Extreme float/double values may cause overflow (Inf) or NaN',
                    expectsOverflow: true }
                : {}),
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

            for (let pIdx = 0; pIdx < params.length; pIdx++) {
                const param = params[pIdx];

                if (sizeToArrayMap.has(pIdx)) {
                    // Paired size param — use moderate value
                    values.push('3');
                    preambles.push(null);
                    declarations.push(null);
                } else if (arraySizePairs.has(pIdx)) {
                    // Paired array param — meaningful ascending content
                    const { base } = arrayBaseType(param.type);
                    const content = makeAscendingArrayContent(3, base);
                    values.push(`{${content}}`);
                    preambles.push(null);
                    declarations.push(`${base} ${param.name}[3] = {${content}}`);
                } else if (isPointerType(param.type) || isArrayType(param.type) || isStructType(param.type)) {
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
                // Mixed min/max can produce finite results (e.g. add(-FLT_MAX, FLT_MAX) = 0)
                // as well as overflow — the outcome depends on function semantics.
                ...(hasFloatingExtreme(params, values)
                    ? { testNote: 'Mixed extreme float/double values \u2014 result depends on function semantics' }
                    : {}),
            });
        }
    }

    return deduplicateSets(sets);
}
// Helper: detect if any float/double param is set to an extreme boundary value
// ---------------------------------------------------------------------------
function hasFloatingExtreme(
    params: FunctionParameter[],
    values: string[]
): boolean {
    const FLOAT_EXTREMES = new Set([
        '-FLT_MAX', 'FLT_MAX', '-DBL_MAX', 'DBL_MAX',
        '(-FLT_MAX + FLT_EPSILON)', '(FLT_MAX - FLT_EPSILON)',
        '(-DBL_MAX + DBL_EPSILON)', '(DBL_MAX - DBL_EPSILON)',
    ]);
    for (let i = 0; i < params.length; i++) {
        const nt = normalizeType(params[i].type);
        if ((nt === 'float' || nt === 'double') && FLOAT_EXTREMES.has(values[i])) {
            return true;
        }
    }
    return false;
}
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Deduplication helper
// ---------------------------------------------------------------------------

function deduplicateSets(sets: BoundarySet[]): BoundarySet[] {
    const seen = new Set<string>();
    return sets.filter(set => {
        if (set.noAssertion) { return true; } // always keep UB-documentation tests
        const key = getBoundarySetKey(set);
        if (seen.has(key)) { return false; }
        seen.add(key);
        return true;
    });
}

export function getBoundarySummary(
    params: FunctionParameter[],
    density: TestDensity = 'standard'
): string {
    const sets = generateBoundarySets(params, density);
    const typeList = params.map(p => normalizeType(p.type));
    const uniqueTypes = Array.from(new Set(typeList));
    return `${sets.length} test cases for ${params.length} parameter(s) (${uniqueTypes.join(', ') || 'none'})`;
}