/**
 * Centralised configuration reader for the C Test Generator extension.
 *
 * All VS Code settings are read here and exposed as a strongly-typed object.
 * Call `getExtensionConfig()` on every command invocation so that settings
 * changed by the user are always picked up without needing to reload the window.
 */
import * as vscode from 'vscode';
import { TestDensity } from './generator/boundaryValues';
// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------
export type OutputFormat = 'googletest' | 'plain';
export interface ExtensionConfig {
    /** Boundary test density level (minimal / standard / exhaustive). */
    testDensity: TestDensity;
    /** Number of additional random test cases generated per parameter. */
    numberOfRandomValues: number;
    /** Include NaN boundary values for floating-point parameters. */
    enableBoundaryNaN: boolean;
    /** Include ±Infinity boundary values for floating-point parameters. */
    enableBoundaryInfinity: boolean;
    /** Include zero / near-zero boundary values. */
    enableBoundaryZero: boolean;
    /** Output format for generated test files. */
    outputFormat: OutputFormat;
    /** Generate negative/invalid-input test cases (e.g. NULL pointers). */
    includeNegativeTests: boolean;
    /**
     * Pattern for the generated test file name.
     * `{filename}` is replaced with the source file's base name (without extension).
     */
    testFileNamingPattern: string;
}
// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------
/**
 * Read all extension settings from VS Code workspace configuration and return
 * them as a typed object.  Safe defaults mirror the `package.json` defaults so
 * the extension behaves identically even when no settings have been set.
 *
 * Should be called on every command invocation (not cached at activation time)
 * so that the user's latest changes are always picked up.
 */
export function getExtensionConfig(): ExtensionConfig {
    const cfg = vscode.workspace.getConfiguration('cTestGenerator');
    const density = cfg.get<string>('testDensity', 'standard');
    const validDensities: TestDensity[] = ['minimal', 'standard', 'exhaustive'];
    const testDensity: TestDensity = (validDensities.includes(density as TestDensity))
        ? (density as TestDensity)
        : 'standard';
    const outputFormatRaw = cfg.get<string>('outputFormat', 'googletest');
    const outputFormat: OutputFormat = (outputFormatRaw === 'plain') ? 'plain' : 'googletest';
    return {
        testDensity,
        numberOfRandomValues:   cfg.get<number>('numberOfRandomValues', 5),
        enableBoundaryNaN:      cfg.get<boolean>('enableBoundaryNaN', true),
        enableBoundaryInfinity: cfg.get<boolean>('enableBoundaryInfinity', true),
        enableBoundaryZero:     cfg.get<boolean>('enableBoundaryZero', true),
        outputFormat,
        includeNegativeTests:   cfg.get<boolean>('includeNegativeTests', true),
        testFileNamingPattern:  cfg.get<string>('testFileNamingPattern', 'test_{filename}'),
    };
}
