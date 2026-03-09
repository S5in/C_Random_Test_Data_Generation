/**
 * Represents a single parameter in a C function
 * Example: for "int x", name="x" and type="int"
 */
export interface FunctionParameter {
    name: string;
    type: string;
}

/**
 * Represents a complete C function signature
 * This is what we extract from the AST and use for test generation
 */
export interface FunctionInfo {
    name: string;
    returnType: string;
    parameters: FunctionParameter[];
    startLine: number;
    endLine: number;
}

export interface GlobalVariable {
    name: string;
    type: string;
    isStatic: boolean;
    isConst: boolean;
    initialValue?: string;
}

/**
 * Represents a struct definition extracted from C source
 */
export interface StructInfo {
    name: string;
    fields: { name: string; type: string; }[];
}
