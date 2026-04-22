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
		tsconfig: {
			type: "string",
			description:
				"Path to tsconfig.json used for transpilation (absolute or relative to the config directory). Overrides auto-discovery.",
		},
	},
	async run({ args }) {
		const tsconfigPath = args.tsconfig;
		const { config, configDir } = await loadConfig(args.config, { tsconfigPath });
		const spec = await loadSpec(config.spec, configDir, { tsconfigPath });
		const outputDir = resolveOutputDir(config, configDir);
		mkdirSync(outputDir, { recursive: true });

		const outputPath = await generateTypes({ config, configDir, spec, outputDir, tsconfigPath });

		console.log(`[orquestra] types generated: ${outputPath}`);
	},
});
