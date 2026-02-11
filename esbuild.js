const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * Copy WASM files to dist
 */
const copyWasmPlugin = {
	name: 'copy-wasm',
	setup(build) {
		build.onEnd(() => {
			// Create dist directory if it doesn't exist
			if (!fs.existsSync('dist')) {
				fs.mkdirSync('dist', { recursive: true });
			}
			
			// Copy tree-sitter-c.wasm
			if (fs.existsSync('tree-sitter-c.wasm')) {
				fs.copyFileSync('tree-sitter-c.wasm', 'dist/tree-sitter-c.wasm');
				console.log('Copied tree-sitter-c.wasm to dist/');
			}
			
			// Copy web-tree-sitter.wasm from node_modules (KEEP THE ORIGINAL NAME)
			const wasmSource = 'node_modules/web-tree-sitter/web-tree-sitter.wasm';
			if (fs.existsSync(wasmSource)) {
				fs.copyFileSync(wasmSource, 'dist/web-tree-sitter.wasm');  // <- Changed this line
				console.log('Copied web-tree-sitter.wasm to dist/');
			}
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode', 'web-tree-sitter'],
		logLevel: 'silent',
		plugins: [
			copyWasmPlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});