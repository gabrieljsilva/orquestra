import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const shared = {
	// Keep host runner and core external — bridge is glue, not bundle.
	external: ["@orquestra/core", "vite", "vitest", "node:fs", "node:path"],
	plugins: [
		resolve({ preferBuiltins: true }),
		commonjs(),
		json(),
		typescript({
			tsconfig: "./tsconfig.build.json",
			exclude: ["**/*.spec.ts"],
		}),
	],
};

// ESM-only: Vitest itself is ESM-only and refuses to be loaded via
// `require()`. Consumers running this bridge are already in Vitest's
// ESM context, so a CJS build would never be loaded — and worse,
// would crash if anything in the chain accidentally `require`d it.
export default [
	{
		input: "src/index.ts",
		output: { file: "dist/index.esm.js", format: "es", sourcemap: false },
		...shared,
	},
	{
		input: "src/plugin.ts",
		// Plugin loads in Vite's config-resolution context, which is often
		// CJS (the default `vite.config.js` without `"type": "module"`).
		// Ship both formats just for this entry — runtime bridge stays
		// ESM-only because Vitest itself is ESM-only.
		output: [
			{ file: "dist/plugin.esm.js", format: "es", sourcemap: false },
			// Use `.cjs` extension because the package has `"type": "module"`
			// — `.js` would be treated as ESM and crash with "exports is not
			// defined" when Vite's CJS config-loader tries to require it.
			{ file: "dist/plugin.cjs", format: "cjs", sourcemap: false, exports: "named" },
		],
		...shared,
	},
];
