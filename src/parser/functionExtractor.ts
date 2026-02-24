/**
 * Function Extractor
 * 
 * Extracts function declarations from C source code using Tree-sitter
 */

const Parser = require('web-tree-sitter');
type Tree = any;
type SyntaxNode = any;
import { FunctionInfo, FunctionParameter } from '../types';

export class FunctionExtractor {
    /**
     * Extract all functions from the C source file
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
     * ✨ NEW: Find function at a specific line number
     */
    static findFunctionAtLine(tree: Tree, lineNumber: number): FunctionInfo | null {
        const allFunctions = this.extractFunctions(tree);
        
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
            if (!declaratorNode) return null;

            const functionName = this.extractFunctionName(declaratorNode);
            if (!functionName) return null;

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
        if (!paramsNode) return parameters;

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
        if (!typeNode) return null;

        const type = typeNode.text;

        const declaratorNode = node.childForFieldName('declarator');
        
        if (!declaratorNode) {
            return null;
        }

        let name = '';
        
        if (declaratorNode.type === 'identifier') {
            name = declaratorNode.text;
        } else if (declaratorNode.type === 'pointer_declarator') {
            const innerDeclarator = declaratorNode.childForFieldName('declarator');
            if (innerDeclarator?.type === 'identifier') {
                name = innerDeclarator.text;
            }
        } else {
            for (let i = 0; i < declaratorNode.childCount; i++) {
                const child = declaratorNode.child(i);
                if (child && child.type === 'identifier') {
                    name = child.text;
                    break;
                }
            }
        }

        if (!name) return null;

        return { name, type };
    }
}
