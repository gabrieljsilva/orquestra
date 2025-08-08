import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.spec.ts"],
		globals: true,
		root: "./",
		mockReset: false,
		exclude: ["**/node_modules/**", "**/dist/**", "**/playground/**/*.spec.ts"],
		coverage: {
			reporter: ["html"],
			provider: "v8",
		},
		hookTimeout: 30000,
	},
	plugins: [],
	resolve: {
		alias: {
			"@core": resolve(__dirname, "./packages/core/src"),
			"@adapters/express": resolve(__dirname, "./packages/adapters/express/src"),
			"@adapters/fastify": resolve(__dirname, "./packages/adapters/fastify/src"),
		},
	},
});
