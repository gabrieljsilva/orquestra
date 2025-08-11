import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/e2e/**/*.spec.ts"],
		globals: true,
		root: "./",
		mockReset: false,
		exclude: ["**/node_modules/**", "**/dist/**"],
		coverage: {
			reporter: ["html"],
			provider: "v8",
		},
		hookTimeout: 30000,
	},
	plugins: [],
});
