/**
 * Function Extractor
 * 
 * Extracts function definitions and declarations from C source code using
 * Tree-sitter.  Definitions (with a body) are found via `function_definition`
 * nodes; declarations (prototypes without a body, as commonly found in header
 * files) are found via top-level `declaration` nodes whose declarator is a
 * `function_declarator`.
 */

const Parser = require('web-tree-sitter');
type Tree = any;
type SyntaxNode = any;
import { FunctionInfo, FunctionParameter } from '../types';

export class FunctionExtractor {
    /**
     * Extract all function *definitions* (with bodies) from the AST.
     * This is the original behaviour — ideal for .c source files.
     */
    static extractFunctions(tree: Tree): FunctionInfo[] {
        const functions: FunctionInfo[] = [];
        const cursor = tree.walk();

        const visitNode = () => {
            const node = cursor.currentNode;

            if (node.type === 'function_definition') {
                const func = this.parseFunctionDefinition(node);
                if (func) {
                    functions.push(func);
                }
            }

            if (cursor.gotoFirstChild()) {
                do {
                    visitNode();
                } while (cursor.gotoNextSibling());
                cursor.gotoParent();
            }
        };

        visitNode();
        return functions;
    }

    /**
     * Extract function *declarations* (prototypes without bodies) from the AST.
     *
     * In header files, functions are declared — not defined — so their AST node
     * is a `declaration` whose declarator is (or wraps) a `function_declarator`.
     * This method specifically targets those nodes.
     *
     * Note: de-duplication against function definitions (to avoid returning a
     * declaration when a matching definition exists) is handled by the caller
     * `extractAllFunctions()`, not by this method.
     */
    static extractFunctionDeclarations(tree: Tree): FunctionInfo[] {
        const declarations: FunctionInfo[] = [];
        const cursor = tree.walk();
        const visitNode = () => {
            const node = cursor.currentNode;
            // Top-level declaration nodes (e.g.  int add(int a, int b);)
            if (node.type === 'declaration') {
                const func = this.parseFunctionDeclaration(node);
                if (func) {
                    declarations.push(func);
                }
            }
            if (cursor.gotoFirstChild()) {
                do {
                    visitNode();
                } while (cursor.gotoNextSibling());
                cursor.gotoParent();
            }
        };
        visitNode();
        return declarations;
    }
    /**
     * Extract both function definitions AND declarations from the AST,
     * de-duplicated by function name (definitions take priority).
     *
     * Useful for header files that may contain a mix of inline function
     * definitions and forward declarations.
     */
    static extractAllFunctions(tree: Tree): FunctionInfo[] {
        const definitions = this.extractFunctions(tree);
        const declarations = this.extractFunctionDeclarations(tree);
        // De-duplicate: definitions win over declarations for the same name.
        const seen = new Set<string>(definitions.map(f => f.name));
        for (const decl of declarations) {
            if (!seen.has(decl.name)) {
                seen.add(decl.name);
                definitions.push(decl);
            }
        }
        return definitions;
    }
    /**
     * Find function at a specific line number.
     * Searches definitions first (original behaviour); when no definition is
     * found, also searches declarations so that header-file prototypes can
     * be located.
     */
    static findFunctionAtLine(tree: Tree, lineNumber: number): FunctionInfo | null {
        const allFunctions = this.extractAllFunctions(tree);
        
        return allFunctions.find(func => 
            lineNumber >= func.startLine && lineNumber <= func.endLine
        ) || null;
    }

    /**
     * Parse a function definition node
     */
    private static parseFunctionDefinition(node: SyntaxNode): FunctionInfo | null {
        try {
            // Extract return type
            const typeNode = node.childForFieldName('type');
            const returnType = typeNode?.text || 'void';

            // Extract function name
            const declaratorNode = node.childForFieldName('declarator');
            if (!declaratorNode) { return null; }

            const functionName = this.extractFunctionName(declaratorNode);
            if (!functionName) { return null; }

            // Extract parameters
            const parameters = this.extractParameters(declaratorNode);

            // Get line numbers
            const startLine = node.startPosition.row;
            const endLine = node.endPosition.row;

            return {
                name: functionName,
                returnType,
                parameters,
                startLine,
                endLine
            };

        } catch (error) {
            console.warn('Failed to parse function:', error);
            return null;
        }
    }
    /**
     * Parse a top-level `declaration` node that may be a function prototype.
     *
     * In tree-sitter-c, a prototype like `int add(int a, int b);` is a
     * `declaration` node whose:
     *   • `type` field is the return type (e.g. `int`)
     *   • `declarator` field is (or wraps) a `function_declarator`
     *
     * Storage-class specifiers such as `extern` are represented as separate
     * child nodes (type `storage_class_specifier`) and are NOT included in
     * the `type` field, so the extracted return type is already clean.
     */
    private static parseFunctionDeclaration(node: SyntaxNode): FunctionInfo | null {
        try {
            const typeNode = node.childForFieldName('type');
            if (!typeNode) { return null; }
            const returnType = typeNode.text || 'void';
            const declaratorNode = node.childForFieldName('declarator');
            if (!declaratorNode) { return null; }
            // The declarator must be (or contain) a function_declarator.
            // It may also be wrapped in a pointer_declarator for pointer-
            // returning functions (e.g. `int *foo(void);`).
            const funcDeclarator = this.findFunctionDeclarator(declaratorNode);
            if (!funcDeclarator) { return null; }
            const functionName = this.extractFunctionName(funcDeclarator);
            if (!functionName) { return null; }
            const parameters = this.extractParameters(funcDeclarator);
            const startLine = node.startPosition.row;
            const endLine = node.endPosition.row;
            return {
                name: functionName,
                returnType,
                parameters,
                startLine,
                endLine
            };
        } catch (error) {
            console.warn('Failed to parse function declaration:', error);
            return null;
        }
    }
    /**
     * Walk down through pointer_declarator wrappers to find the inner
     * function_declarator, if any.
     *
     * Examples:
     *   `int add(int a, int b);`    → declarator IS function_declarator
     *   `int *alloc(size_t n);`     → declarator is pointer_declarator
     *                                  wrapping function_declarator
     */
    private static findFunctionDeclarator(node: SyntaxNode): SyntaxNode | null {
        if (node.type === 'function_declarator') {
            return node;
        }
        if (node.type === 'pointer_declarator') {
            const inner = node.childForFieldName('declarator');
            if (inner) {
                return this.findFunctionDeclarator(inner);
            }
        }
        return null;
    }
    private static extractFunctionName(declaratorNode: SyntaxNode): string {
        if (declaratorNode.type === 'function_declarator') {
            const nameNode = declaratorNode.childForFieldName('declarator');
            if (nameNode?.type === 'identifier') {
                return nameNode.text;
            }
            if (nameNode?.type === 'pointer_declarator') {
                const innerName = nameNode.childForFieldName('declarator');
                return innerName?.text || '';
            }
        }

        for (let i = 0; i < declaratorNode.childCount; i++) {
            const child = declaratorNode.child(i);
            if (child && child.type === 'identifier') {
                return child.text;
            }
        }

        return '';
    }

    private static extractParameters(declaratorNode: SyntaxNode): FunctionParameter[] {
        const parameters: FunctionParameter[] = [];
        
        const paramsNode = declaratorNode.childForFieldName('parameters');
        if (!paramsNode) { return parameters; }
        
        for (let i = 0; i < paramsNode.childCount; i++) {
            const child = paramsNode.child(i);
            
            if (child && child.type === 'parameter_declaration') {
                const param = this.parseParameter(child);
                if (param) {
                    parameters.push(param);
                }
            }
        }

        return parameters;
    }

    private static parseParameter(node: SyntaxNode): FunctionParameter | null {
        const typeNode = node.childForFieldName('type');
        if (!typeNode) { return null; }

        let type = typeNode.text;

        const declaratorNode = node.childForFieldName('declarator');
        
        if (!declaratorNode) {
            return null;
        }

        let name = '';
        
        if (declaratorNode.type === 'identifier') {
            name = declaratorNode.text;
        } else if (declaratorNode.type === 'pointer_declarator') {
            // e.g. "int *ptr" or "float **pp"
            // Count pointer depth so we include the right number of * in the type
            let ptrDepth = 0;
            let current: SyntaxNode = declaratorNode;
            while (current && current.type === 'pointer_declarator') {
                ptrDepth++;
                current = current.childForFieldName('declarator');
            }
            // The innermost node should be the identifier
            if (current && current.type === 'identifier') {
                name = current.text;
            }
            type = type + ' ' + '*'.repeat(ptrDepth);
        } else if (declaratorNode.type === 'array_declarator') {
            // e.g. "int arr[]" or "int arr[10]"
            const nameNode = declaratorNode.childForFieldName('declarator');
            if (nameNode && nameNode.type === 'identifier') {
                name = nameNode.text;
            }
            const sizeNode = declaratorNode.childForFieldName('size');
            type = sizeNode ? `${type}[${sizeNode.text}]` : `${type}[]`;
        } else {
            for (let i = 0; i < declaratorNode.childCount; i++) {
                const child = declaratorNode.child(i);
                if (child && child.type === 'identifier') {
                    name = child.text;
                    break;
                }
            }
        }

        if (!name) { return null; }

        return { name, type };
    }
}
