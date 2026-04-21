import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const shebang = "#!/usr/bin/env node\n";

const shared = {
	external: [
		"@orquestra/core",
		"citty",
		"jiti",
		"node:path",
		"node:fs",
		"node:url",
		"node:test",
		"node:child_process",
	],
	plugins: [
		resolve({ preferBuiltins: true }),
		commonjs(),
		json(),
		typescript({
			tsconfig: "./tsconfig.build.json",
			exclude: ["**/*.test.ts", "**/*.spec.ts"],
		}),
	],
};

export default [
	{
		input: "src/index.ts",
		output: [
			{ file: "dist/index.cjs.js", format: "cjs", sourcemap: false },
			{ file: "dist/index.esm.js", format: "es", sourcemap: false },
		],
		...shared,
	},
	{
		input: "src/cli.ts",
		output: {
			file: "dist/cli.cjs.js",
			format: "cjs",
			sourcemap: false,
			banner: shebang,
		},
		...shared,
	},
	{
		input: "src/worker.ts",
		output: {
			file: "dist/worker.cjs.js",
			format: "cjs",
			sourcemap: false,
		},
		...shared,
	},
];
