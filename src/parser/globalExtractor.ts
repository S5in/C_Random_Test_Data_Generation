/**
 * Global Variable Extractor
 * 
 * Detects and extracts global variable declarations from C source code
 */

const Parser = require('web-tree-sitter');
type Tree = any;
type SyntaxNode = any;
import { GlobalVariable } from '../types';

export class GlobalExtractor {
    /**
     * Extract all global variable declarations from the AST
     * 
     * @param tree - Tree-sitter AST
     * @returns Array of global variables
     */
    static extractGlobals(tree: Tree): GlobalVariable[] {
        const globals: GlobalVariable[] = [];
        
        try {
            const cursor = tree.walk();

            const visitNode = () => {
                const node = cursor.currentNode;

                // Look for top-level declarations
                if (node.type === 'declaration') {
                    // Check if it's at global scope (parent is translation_unit)
                    if (node.parent?.type === 'translation_unit') {
                        const global = this.parseGlobalDeclaration(node);
                        if (global) {
                            globals.push(global);
                        }
                    }
                }

                // Traverse children
                if (cursor.gotoFirstChild()) {
                    do {
                        visitNode();
                    } while (cursor.gotoNextSibling());
                    cursor.gotoParent();
                }
            };

            visitNode();
            
        } catch (error) {
            console.error('[GlobalExtractor] Error extracting globals:', error);
        }

        return globals;
    }

    /**
     * Parse a global declaration node
     */
    private static parseGlobalDeclaration(node: SyntaxNode): GlobalVariable | null {
        try {
            // Get the full declaration text
            const declarationText = node.text;

            // Extract type
            const typeNode = node.childForFieldName('type');
            if (!typeNode) {
                return null;
            }

            let type = typeNode.text;

            // Check modifiers
            const isStatic = declarationText.includes('static');
            const isConst = declarationText.includes('const');

            // If const is not in type but in declaration, add it
            if (isConst && !type.includes('const')) {
                type = 'const ' + type;
            }

            // Extract declarator (variable name and optional initializer)
            const declaratorNode = node.childForFieldName('declarator');
            if (!declaratorNode) {
                return null;
            }

            let name = '';
            let initialValue: string | undefined;

            // Handle different declarator types
            if (declaratorNode.type === 'init_declarator') {
                // Has initializer: int x = 5;
                const idNode = declaratorNode.childForFieldName('declarator');
                name = this.extractIdentifier(idNode);
                
                const valueNode = declaratorNode.childForFieldName('value');
                initialValue = valueNode?.text;
            } else {
                // No initializer: int x;
                name = this.extractIdentifier(declaratorNode);
            }

            if (!name) {
                return null;
            }

            return {
                name,
                type,
                isStatic,
                isConst,
                initialValue
            };

        } catch (error) {
            console.warn('[GlobalExtractor] Failed to parse global declaration:', error);
            return null;
        }
    }

    /**
     * Extract identifier from declarator (handles pointers, arrays, etc.)
     */
    private static extractIdentifier(node: SyntaxNode | null): string {
        if (!node) {
            return '';
        }

        if (node.type === 'identifier') {
            return node.text;
        }

        // Handle pointer_declarator: int *ptr
        if (node.type === 'pointer_declarator') {
            const declarator = node.childForFieldName('declarator');
            if (declarator) {
                return this.extractIdentifier(declarator);
            }
        }

        // Handle array_declarator: int arr[10]
        if (node.type === 'array_declarator') {
            const declarator = node.childForFieldName('declarator');
            if (declarator) {
                return this.extractIdentifier(declarator);
            }
        }

        // Fallback: search for identifier in children
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'identifier') {
                return child.text;
            }
        }

        return '';
    }
}