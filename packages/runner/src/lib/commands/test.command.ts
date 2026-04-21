import { resolve } from "node:path";
import { defineCommand } from "citty";
import { loadConfig } from "../loaders/config.loader";
import { discoverFeatureFiles } from "../loaders/discovery";
import { loadSpec } from "../loaders/spec.loader";
import { ParallelRunner, Runner } from "../runner";

const DEFAULT_CONFIG_FILE = "orquestra.config.ts";

export const testCommand = defineCommand({
	meta: {
		name: "test",
		description: "Run feature tests",
	},
	args: {
		config: {
			type: "string",
			description: "Path to orquestra.config.ts",
			alias: "c",
		},
		concurrency: {
			type: "string",
			description: "Number of parallel workers",
		},
		stopOnFail: {
			type: "boolean",
			description: "Stop all workers on first crash/failure",
			default: false,
		},
		filter: {
			type: "positional",
			description: "Filter features by name",
			required: false,
		},
	},
	async run({ args }) {
		const { config, configDir } = await loadConfig(args.config);
		const spec = await loadSpec(config.spec, configDir);
		const featureFiles = discoverFeatureFiles({
			testMatch: config.testMatch,
			configDir,
			filter: args.filter,
		});

		if (featureFiles.length === 0) {
			console.log("[orquestra] no feature files found");
			return;
		}

		const concurrency = args.concurrency ? Number.parseInt(args.concurrency, 10) : (config.concurrency ?? 1);
		const stopOnFail = args.stopOnFail;

		console.log(`[orquestra] running ${featureFiles.length} feature file(s) with concurrency=${concurrency}\n`);

		if (concurrency <= 1) {
			const runner = new Runner({ config, spec, featureFiles, configDir });
			const { artifact, artifactPath } = await runner.run();
			printSummary(artifact, artifactPath);
			if (artifact.summary.failed > 0) process.exitCode = 1;
			return;
		}

		const configPath = args.config ? resolve(process.cwd(), args.config) : resolve(configDir, DEFAULT_CONFIG_FILE);

		const parallel = new ParallelRunner({
			config,
			configPath,
			configDir,
			spec,
			featureFiles,
			concurrency,
			stopOnFail,
		});

		const { artifact, artifactPath, crashed } = await parallel.run();
		printSummary(artifact, artifactPath);
		if (crashed || artifact.summary.failed > 0) process.exitCode = 1;
	},
});

function printSummary(artifact: { summary: { passed: number; failed: number; pending: number } }, path: string): void {
	const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
	const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
	const gray = (s: string) => `\x1b[90m${s}\x1b[39m`;

	const parts: string[] = [];
	parts.push(green(`${artifact.summary.passed} passed`));
	parts.push(artifact.summary.failed > 0 ? red(`${artifact.summary.failed} failed`) : `${artifact.summary.failed} failed`);
	parts.push(artifact.summary.pending > 0 ? gray(`${artifact.summary.pending} pending`) : `${artifact.summary.pending} pending`);

	console.log(`\n[orquestra] done: ${parts.join(", ")}`);
	console.log(`[orquestra] artifact: ${path}`);
}
