import { mkdirSync } from "node:fs";
import { defineCommand } from "citty";
import { loadConfig } from "../loaders/config.loader";
import { loadSpec } from "../loaders/spec.loader";
import { resolveOutputDir } from "../runner/output-dir";
import { generateTypes } from "../types/type-generator";

export const typesCommand = defineCommand({
	meta: {
		name: "types",
		description: "Generate TypeScript declaration file from the config, spec and feature files",
	},
	args: {
		config: {
			type: "string",
			description: "Path to orquestra.config.ts",
			alias: "c",
		},
	},
	async run({ args }) {
		const { config, configDir } = await loadConfig(args.config);
		const spec = await loadSpec(config.spec, configDir);
		const outputDir = resolveOutputDir(config, configDir);
		mkdirSync(outputDir, { recursive: true });

		const outputPath = await generateTypes({ config, configDir, spec, outputDir });

		console.log(`[orquestra] types generated: ${outputPath}`);
	},
});
