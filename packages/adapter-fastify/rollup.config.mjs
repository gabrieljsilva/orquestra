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
			globals: {
				"reflect-metadata": "Reflect",
				fastify: "fastify",
				"@orquestra/core": "OrquestraCore",
			},
		},
		{
			file: "dist/index.esm.js",
			format: "es",
			sourcemap: false,
			globals: {
				"reflect-metadata": "Reflect",
				fastify: "fastify",
				"@orquestra/core": "OrquestraCore",
			},
		},
	],
	external: ["fastify", "@orquestra/core", "reflect-metadata"],
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
