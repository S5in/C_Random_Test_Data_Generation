import * as assert from 'assert';
import { StructExtractor } from '../parser/structExtractor';
import { StructInfo } from '../types';
import { parseC } from './parserTestHelper';

suite('StructExtractor — named structs', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
struct Point {
    int x;
    int y;
};

struct Color {
    unsigned char r;
    unsigned char g;
    unsigned char b;
};
`;
        tree = await parseC(source);
    });

    test('extracts named struct', () => {
        const structs = StructExtractor.extractStructs(tree);
        const names = structs.map((s: StructInfo) => s.name);
        assert.ok(names.includes('Point'), 'should find Point struct');
        assert.ok(names.includes('Color'), 'should find Color struct');
    });

    test('extracts struct fields', () => {
        const structs = StructExtractor.extractStructs(tree);
        const point = structs.find((s: StructInfo) => s.name === 'Point');
        assert.ok(point, 'Point struct should exist');
        assert.strictEqual(point.fields.length, 2);
        assert.strictEqual(point.fields[0].name, 'x');
        assert.strictEqual(point.fields[0].type, 'int');
        assert.strictEqual(point.fields[1].name, 'y');
        assert.strictEqual(point.fields[1].type, 'int');
    });

    test('extracts Color struct with 3 fields', () => {
        const structs = StructExtractor.extractStructs(tree);
        const color = structs.find((s: StructInfo) => s.name === 'Color');
        assert.ok(color, 'Color struct should exist');
        assert.strictEqual(color.fields.length, 3);
    });
});

suite('StructExtractor — typedef structs', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
typedef struct {
    float x;
    float y;
    float z;
} Vec3;

typedef struct {
    int width;
    int height;
} Rect;
`;
        tree = await parseC(source);
    });

    test('extracts typedef struct names', () => {
        const structs = StructExtractor.extractStructs(tree);
        const names = structs.map((s: StructInfo) => s.name);
        assert.ok(names.includes('Vec3'), 'should find Vec3');
        assert.ok(names.includes('Rect'), 'should find Rect');
    });

    test('extracts typedef struct fields', () => {
        const structs = StructExtractor.extractStructs(tree);
        const vec3 = structs.find((s: StructInfo) => s.name === 'Vec3');
        assert.ok(vec3, 'Vec3 should exist');
        assert.strictEqual(vec3.fields.length, 3);
        assert.strictEqual(vec3.fields[0].name, 'x');
        assert.strictEqual(vec3.fields[0].type, 'float');
    });

    test('extracts Rect struct fields', () => {
        const structs = StructExtractor.extractStructs(tree);
        const rect = structs.find((s: StructInfo) => s.name === 'Rect');
        assert.ok(rect, 'Rect should exist');
        assert.strictEqual(rect.fields.length, 2);
    });
});

suite('StructExtractor — struct with pointer and array fields', () => {
    let tree: any;

    suiteSetup(async () => {
        const source = `
typedef struct {
    char *name;
    int scores[10];
    int count;
} Student;
`;
        tree = await parseC(source);
    });

    test('extracts struct with pointer field', () => {
        const structs = StructExtractor.extractStructs(tree);
        const student = structs.find((s: StructInfo) => s.name === 'Student');
        assert.ok(student, 'Student struct should exist');
        assert.ok(student.fields.length >= 1, 'should have fields');
        const nameField = student.fields.find((f: {name: string; type: string}) => f.name === 'name');
        assert.ok(nameField, 'should have name field');
    });

    test('extracts struct with array field', () => {
        const structs = StructExtractor.extractStructs(tree);
        const student = structs.find((s: StructInfo) => s.name === 'Student');
        assert.ok(student, 'Student struct should exist');
        const scoresField = student.fields.find((f: {name: string; type: string}) => f.name === 'scores');
        assert.ok(scoresField, 'should have scores field');
    });
});

suite('StructExtractor — empty source and edge cases', () => {

    test('returns empty array for source with no structs', async () => {
        const tree = await parseC('int main() { return 0; }');
        const structs = StructExtractor.extractStructs(tree);
        assert.deepStrictEqual(structs, []);
    });

    test('does not duplicate structs', async () => {
        const source = `
struct Point { int x; int y; };
void fn(struct Point p) { }
`;
        const tree = await parseC(source);
        const structs = StructExtractor.extractStructs(tree);
        const points = structs.filter((s: StructInfo) => s.name === 'Point');
        assert.strictEqual(points.length, 1, 'Point should appear only once');
    });

    test('handles forward declaration (no body) gracefully', async () => {
        const source = `struct Node;`;
        const tree = await parseC(source);
        const structs = StructExtractor.extractStructs(tree);
        // Forward declarations without a body should not be returned
        assert.strictEqual(structs.length, 0, 'forward declarations without body should be skipped');
    });
});
