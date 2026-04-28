import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
	input: "src/index.ts",
	output: [
		{
			file: "dist/index.cjs.js",
			format: "cjs",
			sourcemap: false,
		},
		{
			file: "dist/index.esm.js",
			format: "es",
			sourcemap: false,
		},
	],
	// Keep all third-party dependencies external — the adapter is a thin
	// glue layer (~50 lines), so bundling them just inflates the published
	// tarball and breaks dedup with the consumer's installed copies.
	// `supertest/lib/agent` is matched by a regex so the deep import is
	// also externalized.
	external: ["express", "@orquestra/core", "reflect-metadata", "supertest", /^supertest\//],
	plugins: [
		resolve({
			preferBuiltins: true,
		}),
		commonjs(),
		json(),
		typescript({
			tsconfig: "./tsconfig.build.json",
			exclude: ["**/*.test.ts", "**/*.spec.ts"],
		}),
	],
};
