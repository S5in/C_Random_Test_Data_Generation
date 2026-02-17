// Use require to avoid TypeScript module resolution issues
const Parser = require('web-tree-sitter');
type ParserType = typeof Parser;
type Tree = any;  // Parser.Tree
type SyntaxNode = any;  // Parser.SyntaxNode
import { FunctionInfo, FunctionParameter } from '../types';

export class FunctionExtractor {
    /**
     * Extract all function definitions from the AST
     */
    static extractFunctions(tree: Tree): FunctionInfo[] {
        const functions: FunctionInfo[] = [];
        const cursor = tree.walk();

        const visitNode = () => {
            const node = cursor.currentNode;

            // Look for function_definition nodes
            if (node.type === 'function_definition') {
                const functionInfo = this.parseFunctionDefinition(node);
                if (functionInfo) {
                    functions.push(functionInfo);
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
        return functions;
    }

    /**
     * Parse a function_definition node to extract function information
     */
    private static parseFunctionDefinition(node: SyntaxNode): FunctionInfo | null {
        // Function definition structure:
        // function_definition
        //   ├── type (return type)
        //   ├── function_declarator
        //   │   ├── identifier (function name)
        //   │   └── parameter_list
        //   └── compound_statement (body)

        const declarator = node.childForFieldName('declarator');
        if (!declarator) return null;

        const functionName = this.getFunctionName(declarator);
        if (!functionName) return null;

        const returnType = this.getReturnType(node);
        const parameters = this.getParameters(declarator);

        return {
            name: functionName,
            returnType: returnType || 'void',
            parameters,
            startLine: node.startPosition.row,
            endLine: node.endPosition.row
        };
    }

    private static getFunctionName(declarator: SyntaxNode): string | null {
        // Handle different declarator types (pointer_declarator, function_declarator, etc.)
        let current = declarator;
        
        while (current) {
            if (current.type === 'identifier') {
                return current.text;
            }
            
            // For function_declarator, identifier is a child
            const identifier = current.childForFieldName('declarator');
            if (identifier) {
                current = identifier;
            } else {
                // Try to find identifier among children
                for (let i = 0; i < current.childCount; i++) {
                    const child = current.child(i);
                    if (child && child.type === 'identifier') {
                        return child.text;
                    }
                }
                break;
            }
        }
        
        return null;
    }

    private static getReturnType(node: SyntaxNode): string | null {
        const typeNode = node.childForFieldName('type');
        return typeNode ? typeNode.text : null;
    }

    private static getParameters(declarator: SyntaxNode): FunctionParameter[] {
        const parameters: FunctionParameter[] = [];
        
        // Find parameter_list
        let paramList: SyntaxNode | null = null;
        
        const findParamList = (node: SyntaxNode): SyntaxNode | null => {
            if (node.type === 'parameter_list') {
                return node;
            }
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) {
                    const result = findParamList(child);
                    if (result) return result;
                }
            }
            return null;
        };
        
        paramList = findParamList(declarator);
        if (!paramList) return parameters;

        // Parse each parameter
        for (let i = 0; i < paramList.childCount; i++) {
            const child = paramList.child(i);
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
        const declaratorNode = node.childForFieldName('declarator');
        
        if (!typeNode) return null;

        const paramType = typeNode.text.trim();
        
        if (paramType === 'void' && !declaratorNode) {
            return null;
        }

        let paramName = '';
        if (declaratorNode) {
            paramName = this.getParameterName(declaratorNode);
        }

        return {
            name: paramName || 'param',
            type: paramType
        };
    }

    private static getParameterName(declarator: SyntaxNode): string {
        // Handle pointer_declarator, identifier, etc.
        if (declarator.type === 'identifier') {
            return declarator.text;
        }
        
        // For pointer_declarator, array_declarator, etc.
        for (let i = 0; i < declarator.childCount; i++) {
            const child = declarator.child(i);
            if (child && child.type === 'identifier') {
                return child.text;
            }
        }
        
        return '';
    }
}
