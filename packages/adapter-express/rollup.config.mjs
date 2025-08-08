import path from "node:path";
import { fileURLToPath } from "node:url";
import alias from "@rollup/plugin-alias";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
	input: "src/index.ts",
	output: [
		{
			file: "dist/index.cjs.js",
			format: "cjs",
			sourcemap: false,
			globals: {
				"reflect-metadata": "Reflect",
				express: "express",
				"@orquestra/core": "OrquestraCore",
			},
		},
		{
			file: "dist/index.esm.js",
			format: "es",
			sourcemap: false,
			globals: {
				"reflect-metadata": "Reflect",
				express: "express",
				"@orquestra/core": "OrquestraCore",
			},
		},
	],
	external: ["express", "@orquestra/core", "reflect-metadata"],
	plugins: [
		resolve({
			preferBuiltins: true
		}),
		commonjs(),
		json(),
		alias({
			entries: [{ find: "@core", replacement: path.resolve(__dirname, "../core/src") }],
		}),
		typescript({
			tsconfig: "./tsconfig.build.json",
			exclude: ["**/*.test.ts", "**/*.spec.ts"],
		}),
	],
};
