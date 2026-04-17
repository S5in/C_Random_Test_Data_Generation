import * as assert from 'assert';
import {
    getBoundaryValues,
    getBoundariesForType,
    isSupportedType,
    isPointerType,
    isArrayType,
    isStructType,
    isFloatSpecialValue,
    isNegativeFiniteFloat,
    getStructBareName,
    detectArraySizePairs,
    generateBoundarySets,
    setKnownStructNames,
    setKnownStructInfos,
    getSafeDefaultForType,
    BoundaryValue,
    BoundarySet,
} from '../generator/boundaryValues';
import { FunctionParameter } from '../types';
suite('BoundaryValues — primitive type catalog', () => {
    // -----------------------------------------------------------------------
    // isSupportedType
    // -----------------------------------------------------------------------
    test('isSupportedType returns true for known types', () => {
        for (const t of ['int', 'unsigned int', 'float', 'double', 'char', 'long', 'short', 'size_t']) {
            assert.strictEqual(isSupportedType(t), true, `Expected isSupportedType('${t}') to be true`);
        }
    });
    test('isSupportedType returns false for unknown types', () => {
        assert.strictEqual(isSupportedType('MyStruct'), false);
        assert.strictEqual(isSupportedType('void'), false);
        assert.strictEqual(isSupportedType(''), false);
    });
    // -----------------------------------------------------------------------
    // getBoundaryValues / getBoundariesForType
    // -----------------------------------------------------------------------
    test('getBoundaryValues returns empty array for unknown type', () => {
        assert.deepStrictEqual(getBoundaryValues('unknown_type_xyz'), []);
    });
    test('getBoundariesForType delegates to getBoundaryValues', () => {
        assert.deepStrictEqual(getBoundariesForType('int'), getBoundaryValues('int'));
    });
    // int
    test('int boundaries include minimum and maximum', () => {
        const vals = getBoundaryValues('int');
        const labels = vals.map(v => v.label);
        assert.ok(labels.includes('minimum'), 'int should have minimum');
        assert.ok(labels.includes('maximum'), 'int should have maximum');
        assert.ok(labels.includes('zero'), 'int should have zero');
    });
    test('int boundary literals use INT_MIN / INT_MAX', () => {
        const vals = getBoundaryValues('int');
        const min = vals.find(v => v.label === 'minimum');
        const max = vals.find(v => v.label === 'maximum');
        assert.strictEqual(min?.literal, 'INT_MIN');
        assert.strictEqual(max?.literal, 'INT_MAX');
    });
    test('int boundary minimum requires climits header', () => {
        const vals = getBoundaryValues('int');
        const min = vals.find(v => v.label === 'minimum');
        assert.strictEqual(min?.requiresHeader, 'climits');
    });
    // unsigned int
    test('unsigned int boundaries do not have a negative minimum', () => {
        const vals = getBoundaryValues('unsigned int');
        const min = vals.find(v => v.label === 'minimum');
        assert.strictEqual(min?.literal, '0');
    });
    test('unsigned int maximum uses UINT_MAX', () => {
        const vals = getBoundaryValues('unsigned int');
        const max = vals.find(v => v.label === 'maximum');
        assert.strictEqual(max?.literal, 'UINT_MAX');
    });
    // float
    test('float boundaries include NaN and infinity', () => {
        const vals = getBoundaryValues('float');
        const labels = vals.map(v => v.label);
        assert.ok(labels.includes('nan'), 'float should have nan');
        assert.ok(labels.includes('positive-infinity'), 'float should have positive-infinity');
        assert.ok(labels.includes('negative-infinity'), 'float should have negative-infinity');
    });
    test('float minimum uses -FLT_MAX', () => {
        const vals = getBoundaryValues('float');
        const min = vals.find(v => v.label === 'minimum');
        assert.strictEqual(min?.literal, '-FLT_MAX');
    });
    test('float maximum uses FLT_MAX', () => {
        const vals = getBoundaryValues('float');
        const max = vals.find(v => v.label === 'maximum');
        assert.strictEqual(max?.literal, 'FLT_MAX');
    });
    test('float zero boundary uses 0.0f', () => {
        const vals = getBoundaryValues('float');
        const zero = vals.find(v => v.label === 'zero');
        assert.strictEqual(zero?.literal, '0.0f');
    });
    // double
    test('double boundaries include NaN and infinity', () => {
        const vals = getBoundaryValues('double');
        const labels = vals.map(v => v.label);
        assert.ok(labels.includes('nan'), 'double should have nan');
        assert.ok(labels.includes('positive-infinity'), 'double should have positive-infinity');
        assert.ok(labels.includes('negative-infinity'), 'double should have negative-infinity');
    });
    test('double minimum uses -DBL_MAX', () => {
        const vals = getBoundaryValues('double');
        const min = vals.find(v => v.label === 'minimum');
        assert.strictEqual(min?.literal, '-DBL_MAX');
    });
    // char
    test('char boundaries include null-terminator and printable', () => {
        const vals = getBoundaryValues('char');
        const labels = vals.map(v => v.label);
        assert.ok(labels.includes('null-terminator'), 'char should have null-terminator');
        assert.ok(labels.includes('printable'), 'char should have printable');
    });
    test('char minimum uses CHAR_MIN', () => {
        const vals = getBoundaryValues('char');
        const min = vals.find(v => v.label === 'minimum');
        assert.strictEqual(min?.literal, 'CHAR_MIN');
    });
    // size_t
    test('size_t boundaries exist', () => {
        const vals = getBoundaryValues('size_t');
        assert.ok(vals.length > 0, 'size_t should have boundaries');
    });
    test('size_t minimum is 0', () => {
        const vals = getBoundaryValues('size_t');
        const min = vals.find(v => v.label === 'minimum');
        assert.strictEqual(min?.literal, '0');
    });
    test('size_t maximum uses SIZE_MAX', () => {
        const vals = getBoundaryValues('size_t');
        const max = vals.find(v => v.label === 'maximum');
        assert.strictEqual(max?.literal, 'SIZE_MAX');
    });
    // type normalization
    test('getBoundaryValues normalizes whitespace/case', () => {
        const a = getBoundaryValues('int');
        const b = getBoundaryValues('  INT  ');
        assert.deepStrictEqual(a, b);
    });
});
suite('BoundaryValues — type predicates', () => {
    test('isPointerType detects * pointer types', () => {
        assert.strictEqual(isPointerType('int *'), true);
        assert.strictEqual(isPointerType('char *'), true);
        assert.strictEqual(isPointerType('float **'), true);
        assert.strictEqual(isPointerType('int'), false);
        assert.strictEqual(isPointerType('double'), false);
    });
    test('isArrayType detects [] array types', () => {
        assert.strictEqual(isArrayType('int[]'), true);
        assert.strictEqual(isArrayType('int[10]'), true);
        assert.strictEqual(isArrayType('int'), false);
        assert.strictEqual(isArrayType('int *'), false);
    });
    test('isStructType detects struct prefix', () => {
        assert.strictEqual(isStructType('struct Point'), true);
        assert.strictEqual(isStructType('int'), false);
    });
    test('isStructType detects registered typedef names', () => {
        setKnownStructNames(['Rectangle', 'Color']);
        assert.strictEqual(isStructType('Rectangle'), true);
        assert.strictEqual(isStructType('Color'), true);
        assert.strictEqual(isStructType('Unknown'), false);
        // clean up
        setKnownStructNames([]);
    });
});
suite('BoundaryValues — isFloatSpecialValue', () => {
    test('NAN is a special value', () => {
        assert.strictEqual(isFloatSpecialValue('NAN'), true);
        assert.strictEqual(isFloatSpecialValue('nan'), true);
        assert.strictEqual(isFloatSpecialValue('NANF'), true);
    });
    test('INFINITY variants are special values', () => {
        assert.strictEqual(isFloatSpecialValue('INFINITY'), true);
        assert.strictEqual(isFloatSpecialValue('-INFINITY'), true);
        assert.strictEqual(isFloatSpecialValue('inf'), true);
        assert.strictEqual(isFloatSpecialValue('-inf'), true);
    });
    test('normal literals are not special values', () => {
        assert.strictEqual(isFloatSpecialValue('0.0f'), false);
        assert.strictEqual(isFloatSpecialValue('FLT_MAX'), false);
        assert.strictEqual(isFloatSpecialValue('1.0'), false);
        assert.strictEqual(isFloatSpecialValue('INT_MIN'), false);
    });
});
suite('BoundaryValues — isNegativeFiniteFloat', () => {
    test('-FLT_MAX is a negative finite float', () => {
        assert.strictEqual(isNegativeFiniteFloat('-FLT_MAX'), true);
    });
    test('(-FLT_MAX + FLT_EPSILON) is a negative finite float', () => {
        assert.strictEqual(isNegativeFiniteFloat('(-FLT_MAX + FLT_EPSILON)'), true);
    });
    test('-DBL_MAX is a negative finite float', () => {
        assert.strictEqual(isNegativeFiniteFloat('-DBL_MAX'), true);
    });
    test('-0.0f is NOT a negative finite float', () => {
        assert.strictEqual(isNegativeFiniteFloat('-0.0f'), false);
        assert.strictEqual(isNegativeFiniteFloat('-0.0'), false);
    });
    test('-INFINITY is NOT a negative finite float', () => {
        assert.strictEqual(isNegativeFiniteFloat('-INFINITY'), false);
        assert.strictEqual(isNegativeFiniteFloat('-infinity'), false);
    });
    test('-NAN is NOT a negative finite float', () => {
        assert.strictEqual(isNegativeFiniteFloat('-NAN'), false);
    });
    test('positive literals are NOT negative finite floats', () => {
        assert.strictEqual(isNegativeFiniteFloat('FLT_MAX'), false);
        assert.strictEqual(isNegativeFiniteFloat('1.0'), false);
        assert.strictEqual(isNegativeFiniteFloat('0.0f'), false);
    });
});
suite('BoundaryValues — getStructBareName', () => {
    test('strips "struct " prefix', () => {
        assert.strictEqual(getStructBareName('struct Point'), 'point');
    });
    test('lowercases plain name', () => {
        assert.strictEqual(getStructBareName('Rectangle'), 'rectangle');
    });
    test('handles mixed case', () => {
        assert.strictEqual(getStructBareName('MyStruct'), 'mystruct');
    });
});
suite('BoundaryValues — getSafeDefaultForType', () => {
    test('returns float literal for float type', () => {
        assert.strictEqual(getSafeDefaultForType('float'), '1.0f');
    });
    test('returns double literal for double type', () => {
        assert.strictEqual(getSafeDefaultForType('double'), '1.0');
    });
    test('returns char literal for char type', () => {
        assert.strictEqual(getSafeDefaultForType('char'), "'a'");
    });
    test('returns unsigned literal for unsigned types', () => {
        assert.strictEqual(getSafeDefaultForType('unsigned int'), '10');
    });
    test('returns 10 for generic int type', () => {
        assert.strictEqual(getSafeDefaultForType('int'), '10');
    });
});
suite('BoundaryValues — detectArraySizePairs', () => {
    test('detects arr + size parameter pair', () => {
        const params: FunctionParameter[] = [
            { name: 'arr', type: 'int[]' },
            { name: 'size', type: 'int' },
        ];
        const pairs = detectArraySizePairs(params);
        assert.strictEqual(pairs.size, 1);
        assert.strictEqual(pairs.get(0), 1); // arr at index 0, size at index 1
    });
    test('detects arr + len parameter pair', () => {
        const params: FunctionParameter[] = [
            { name: 'arr', type: 'float[]' },
            { name: 'len', type: 'int' },
        ];
        const pairs = detectArraySizePairs(params);
        assert.strictEqual(pairs.size, 1);
        assert.strictEqual(pairs.get(0), 1);
    });
    test('returns empty map when no array parameters', () => {
        const params: FunctionParameter[] = [
            { name: 'x', type: 'int' },
            { name: 'y', type: 'float' },
        ];
        const pairs = detectArraySizePairs(params);
        assert.strictEqual(pairs.size, 0);
    });
    test('does not pair array with another array', () => {
        const params: FunctionParameter[] = [
            { name: 'arr', type: 'int[]' },
            { name: 'other', type: 'int[]' },
        ];
        const pairs = detectArraySizePairs(params);
        assert.strictEqual(pairs.size, 0);
    });
});
suite('BoundaryValues — generateBoundarySets', () => {
    test('empty params returns single NoParams set', () => {
        const sets = generateBoundarySets([], 'standard');
        assert.strictEqual(sets.length, 1);
        assert.strictEqual(sets[0].label, 'NoParams');
    });
    test('single int param generates multiple sets', () => {
        const params: FunctionParameter[] = [{ name: 'x', type: 'int' }];
        const sets = generateBoundarySets(params, 'standard');
        assert.ok(sets.length > 1, 'should have more than 1 set for single int param');
    });
    test('minimal density generates fewer sets than standard', () => {
        const params: FunctionParameter[] = [{ name: 'x', type: 'int' }];
        const minimal = generateBoundarySets(params, 'minimal');
        const standard = generateBoundarySets(params, 'standard');
        assert.ok(minimal.length <= standard.length, 'minimal should have <= sets than standard');
    });
    test('exhaustive density generates more sets than standard', () => {
        const params: FunctionParameter[] = [{ name: 'x', type: 'int' }];
        const standard = generateBoundarySets(params, 'standard');
        const exhaustive = generateBoundarySets(params, 'exhaustive');
        assert.ok(exhaustive.length >= standard.length, 'exhaustive should have >= sets than standard');
    });
    test('enableBoundaryNaN=false excludes NaN sets for float', () => {
        const params: FunctionParameter[] = [{ name: 'x', type: 'float' }];
        const sets = generateBoundarySets(params, 'standard', [], { enableBoundaryNaN: false });
        const hasNaN = sets.some(s => s.label.toLowerCase().includes('nan'));
        assert.strictEqual(hasNaN, false, 'NaN sets should be excluded');
    });
    test('enableBoundaryInfinity=false excludes infinity sets for float', () => {
        const params: FunctionParameter[] = [{ name: 'x', type: 'float' }];
        const sets = generateBoundarySets(params, 'standard', [], { enableBoundaryInfinity: false });
        const hasInf = sets.some(s =>
            s.label.toLowerCase().includes('inf')
        );
        assert.strictEqual(hasInf, false, 'Infinity sets should be excluded');
    });
    test('enableBoundaryZero=false excludes zero boundary sets', () => {
        const params: FunctionParameter[] = [{ name: 'x', type: 'float' }];
        const sets = generateBoundarySets(params, 'exhaustive', [], { enableBoundaryZero: false });
        // Zero boundary classes (zero, negative-zero, near-zero-positive, near-zero-negative,
        // smallest-positive) should be excluded from one-at-a-time tests.
        // The Baseline_AllZero is always present (it's a nominal test, not a zero-boundary test).
        const nonBaselineSets = sets.filter((s: BoundarySet) => !s.label.startsWith('Baseline_'));
        const zeroLabels = ['Zero', 'NegativeZero', 'NearZeroPositive', 'NearZeroNegative', 'SmallestPositive'];
        const hasZeroBoundary = nonBaselineSets.some((s: BoundarySet) =>
            zeroLabels.some(z => s.label.includes(z))
        );
        assert.strictEqual(hasZeroBoundary, false, 'Zero boundary sets should be excluded');
    });
    test('sets have required headers field', () => {
        const params: FunctionParameter[] = [{ name: 'x', type: 'int' }];
        const sets = generateBoundarySets(params, 'standard');
        for (const set of sets) {
            assert.ok(Array.isArray(set.requiredHeaders), 'requiredHeaders should be an array');
        }
    });
    test('two int params generate combination tests', () => {
        const params: FunctionParameter[] = [
            { name: 'a', type: 'int' },
            { name: 'b', type: 'int' },
        ];
        const sets = generateBoundarySets(params, 'standard');
        const labels = sets.map(s => s.label);
        // Should have combination tests like AllMin / AllMax
        const hasCombo = labels.some(l => l.includes('Combination') || l.includes('Min') || l.includes('Max'));
        assert.ok(hasCombo, 'should have combination/boundary sets for two params');
    });
    test('pointer param generates null-pointer set', () => {
        const params: FunctionParameter[] = [{ name: 'ptr', type: 'int *' }];
        const sets = generateBoundarySets(params, 'standard');
        // For a single pointer param, the baseline test uses NULL (the nominal for
        // pointers), so NullPointer is deduplicated with Baseline_AllZero.
        // Verify that at least one set has NULL in its values.
        const hasNull = sets.some((s: BoundarySet) =>
            s.values.some((v: string) => v === 'NULL')
        );
        assert.ok(hasNull, 'pointer param should produce a NULL test case');
    });
    test('includeNegativeTests=false excludes null pointer sets', () => {
        const params: FunctionParameter[] = [{ name: 'ptr', type: 'int *' }];
        const sets = generateBoundarySets(params, 'standard', [], { includeNegativeTests: false });
        const hasNull = sets.some(s => s.label.includes('NullPointer'));
        assert.strictEqual(hasNull, false, 'NullPointer sets should be excluded when includeNegativeTests is false');
    });
    test('setKnownStructInfos enables struct-aware initializers', () => {
        setKnownStructNames(['Point']);
        setKnownStructInfos([{ name: 'Point', fields: [{ name: 'x', type: 'int' }, { name: 'y', type: 'int' }] }]);
        const params: FunctionParameter[] = [{ name: 'p', type: 'Point' }];
        const sets = generateBoundarySets(params, 'standard');
        assert.ok(sets.length > 0, 'should generate sets for struct param');
        // Clean up
        setKnownStructNames([]);
        setKnownStructInfos([]);
    });
});