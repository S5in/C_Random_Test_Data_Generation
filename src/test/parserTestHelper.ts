/**
 * Shared helper to initialize web-tree-sitter and load the C grammar.
 * Used by parser test suites (functionExtractor, structExtractor, globalExtractor).
 */
import * as path from 'path';

const { Parser, Language } = require('web-tree-sitter');

let _parserInstance: any = null;

/**
 * Initialize tree-sitter once and return a ready-to-use Parser instance.
 * Subsequent calls return the same parser (idempotent).
 */
export async function getParser(): Promise<any> {
    if (_parserInstance) {
        return _parserInstance;
    }

    // The compiled test files live at out/test/*.js.
    // __dirname is the out/test/ directory at runtime.
    // node_modules/web-tree-sitter/web-tree-sitter.wasm is the WASM engine.
    // tree-sitter-c.wasm is at the project root.
    const projectRoot = path.join(__dirname, '..', '..');

    await Parser.init({
        locateFile(scriptName: string) {
            return path.join(projectRoot, 'node_modules', 'web-tree-sitter', scriptName);
        },
    });

    const parser = new Parser();
    const wasmPath = path.join(projectRoot, 'tree-sitter-c.wasm');
    const CLang = await Language.load(wasmPath);
    parser.setLanguage(CLang);

    _parserInstance = parser;
    return parser;
}

/**
 * Parse a snippet of C source code and return the tree-sitter Tree.
 */
export async function parseC(source: string): Promise<any> {
    const parser = await getParser();
    return parser.parse(source);
}
