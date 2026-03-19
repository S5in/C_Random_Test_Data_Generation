/**
 * Struct Definition Extractor
 *
 * Finds and extracts struct definitions from C source files using Tree-sitter.
 * Used so boundary value generation can create tests with proper struct
 * field initialization.
 */
type Tree = any;
type SyntaxNode = any;
import { StructInfo } from '../types';
export class StructExtractor {
    /**
     * Extract all struct definitions from the AST.
     * Handles both named structs (`struct Point { ... }`) and
     * typedef'd anonymous structs (`typedef struct { ... } Point;`).
     */
    static extractStructs(tree: Tree): StructInfo[] {
        const structs: StructInfo[] = [];
        const seen = new Set<string>();
        const visitNode = (node: SyntaxNode) => {
            if (node.type === 'type_definition') {
                // Handle: typedef struct { ... } Name;
                const struct = this.parseTypedefStruct(node);
                if (struct && !seen.has(struct.name)) {
                    seen.add(struct.name);
                    structs.push(struct);
                }
            } else if (node.type === 'struct_specifier') {
                // Handle: struct Name { ... };
                const struct = this.parseStructSpecifier(node);
                if (struct && !seen.has(struct.name)) {
                    seen.add(struct.name);
                    structs.push(struct);
                }
            }
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) {
                    visitNode(child);
                }
            }
        };
        visitNode(tree.rootNode);
        return structs;
    }
    /**
     * Parse a `type_definition` node for the pattern:
     *   typedef struct { ... } Name;
     * Extracts the typedef name from the `type_identifier` sibling of an
     * anonymous `struct_specifier` (one without a name field).
     * Named structs in a typedef (e.g. `typedef struct Foo { ... } Foo;`)
     * are left to `parseStructSpecifier` to avoid duplicates.
     */
    private static parseTypedefStruct(node: SyntaxNode): StructInfo | null {
        try {
            let structNode: SyntaxNode | null = null;
            let typedefName: string | null = null;

            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (!child) { continue; }
                if (child.type === 'struct_specifier') {
                    structNode = child;
                } else if (child.type === 'type_identifier') {
                    typedefName = child.text;
                }
            }

            if (!structNode || !typedefName) { return null; }

            // If the struct already has a name, parseStructSpecifier handles it.
            const structNameNode = structNode.childForFieldName('name');
            if (structNameNode) { return null; }

            const bodyNode = structNode.childForFieldName('body');
            if (!bodyNode) { return null; }

            const fields: { name: string; type: string; }[] = [];
            for (let i = 0; i < bodyNode.childCount; i++) {
                const child = bodyNode.child(i);
                if (!child || child.type !== 'field_declaration') { continue; }
                const typeNode = child.childForFieldName('type');
                const declaratorNode = child.childForFieldName('declarator');
                if (!typeNode || !declaratorNode) { continue; }
                const fieldType = typeNode.text;
                const fieldName = this.extractFieldName(declaratorNode);
                if (fieldName) {
                    fields.push({ name: fieldName, type: fieldType });
                }
            }

            return { name: typedefName, fields };
        } catch {
            return null;
        }
    }
    /**
     * Parse a struct_specifier node into a StructInfo.
     * Only processes structs that have a named identifier AND a body.
     */
    private static parseStructSpecifier(node: SyntaxNode): StructInfo | null {
        try {
            const nameNode = node.childForFieldName('name');
            if (!nameNode) {
                return null;
            }
            const bodyNode = node.childForFieldName('body');
            if (!bodyNode) {
                // Forward declaration with no body – skip
                return null;
            }
            const name = nameNode.text;
            const fields: { name: string; type: string; }[] = [];
            for (let i = 0; i < bodyNode.childCount; i++) {
                const child = bodyNode.child(i);
                if (!child || child.type !== 'field_declaration') {
                    continue;
                }
                const typeNode = child.childForFieldName('type');
                const declaratorNode = child.childForFieldName('declarator');
                if (!typeNode || !declaratorNode) {
                    continue;
                }
                const fieldType = typeNode.text;
                const fieldName = this.extractFieldName(declaratorNode);
                if (fieldName) {
                    fields.push({ name: fieldName, type: fieldType });
                }
            }
            return { name, fields };
        } catch {
            return null;
        }
    }
    /**
     * Extract the identifier name from a field declarator node,
     * handling pointer and array sub-declarators.
     */
    private static extractFieldName(node: SyntaxNode): string {
        if (!node) {
            return '';
        }
        if (node.type === 'field_identifier') {
            return node.text;
        }
        if (node.type === 'pointer_declarator') {
            const inner = node.childForFieldName('declarator');
            return inner ? this.extractFieldName(inner) : '';
        }
        if (node.type === 'array_declarator') {
            const inner = node.childForFieldName('declarator');
            return inner ? this.extractFieldName(inner) : '';
        }
        // Fallback: search children for an identifier
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'identifier') {
                return child.text;
            }
        }
        return '';
    }
}