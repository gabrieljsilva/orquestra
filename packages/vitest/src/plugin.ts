import type { Plugin } from "vite";

const DEFAULT_INCLUDE = /\.(spec|test|feature)\.[mc]?[tj]sx?$/;
const IMPORTS_BRIDGE = /from\s+["']@orquestra\/vitest["']/;
const ALREADY_HAS_RUN_FEATURES = /\brunFeatures\s*\(/;

const APPENDED = [
	"",
	"// Auto-injected by `@orquestra/vitest/plugin` — registers the file's",
	"// declared features with Vitest. Skipped when the file already calls",
	"// runFeatures() explicitly.",
	'import { runFeatures as __orquestraRunFeatures__ } from "@orquestra/vitest";',
	"__orquestraRunFeatures__();",
	"",
].join("\n");

export interface OrquestraVitestPluginOptions {
	/**
	 * File pattern that selects spec files for transformation. Default
	 * matches `.spec`, `.test` and `.feature` with `.ts/.tsx/.js/.jsx/.mts/.cts`.
	 *
	 * Files outside this pattern are passed through untouched, so the plugin
	 * is safe to enable globally.
	 */
	include?: RegExp;
}

/**
 * Vite plugin that auto-injects `runFeatures()` at the end of any spec
 * file importing from `@orquestra/vitest`. Files that already call
 * `runFeatures()` explicitly are skipped — both styles co-exist.
 *
 * @example
 * ```ts
 * // vite.config.js
 * import { orquestraVitest } from "@orquestra/vitest/plugin";
 * import { defineConfig } from "vitest/config";
 *
 * export default defineConfig({
 *   plugins: [orquestraVitest()],
 *   test: { include: ["src/**\/*.spec.ts"] },
 * });
 * ```
 */
export function orquestraVitest(options: OrquestraVitestPluginOptions = {}): Plugin {
	const include = options.include ?? DEFAULT_INCLUDE;

	return {
		name: "@orquestra/vitest:auto-run-features",
		// Run before the TS/SWC transformer so the appended snippet still
		// goes through type-stripping with the rest of the file.
		enforce: "pre",
		transform(code, id) {
			if (!include.test(id)) return null;
			if (!IMPORTS_BRIDGE.test(code)) return null;
			if (ALREADY_HAS_RUN_FEATURES.test(code)) return null;

			return {
				code: code + APPENDED,
				// Identity source map: the original code isn't moved, only
				// extended at the end. Returning `null` lets Vite generate
				// the trivial map automatically.
				map: null,
			};
		},
	};
}
