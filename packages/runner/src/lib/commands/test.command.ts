import { basename, resolve } from "node:path";
import { defineCommand } from "citty";
import { loadConfig } from "../loaders/config.loader";
import { discoverFeatureFiles } from "../loaders/discovery";
import { loadSpec } from "../loaders/spec.loader";
import { ParallelRunner, type RunTimings } from "../runner";

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
		tsconfig: {
			type: "string",
			description:
				"Path to tsconfig.json used for transpilation (absolute or relative to the config directory). Overrides auto-discovery.",
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
		allowPending: {
			type: "boolean",
			description: "Treat pending scenarios as success (default: pending fails the run)",
			default: false,
		},
		featureTimeout: {
			type: "string",
			description: "Per-feature timeout in ms (kills worker if exceeded). Defaults to 5x hook timeout.",
		},
		debug: {
			type: "boolean",
			description: "Run a single worker with --inspect-brk and inline source maps. Forces concurrency=1.",
			default: false,
		},
		detectOpenHandles: {
			type: "boolean",
			description:
				"Track async resources created during each feature; report those that still keep the event loop alive when the feature ends. Diagnostic only — never fails the run. Overrides config.detectOpenHandles.",
		},
		filter: {
			type: "positional",
			description: "Filter features by name",
			required: false,
		},
	},
	async run({ args }) {
		const tsconfigPath = args.tsconfig;
		const tConfigStart = Date.now();
		const { config, configDir, jiti } = await loadConfig(args.config, { tsconfigPath });
		const loadConfigMs = Date.now() - tConfigStart;

		const tSpecStart = Date.now();
		const spec = await loadSpec(config.spec, configDir, { tsconfigPath, jiti });
		const loadSpecMs = Date.now() - tSpecStart;

		const tDiscoveryStart = Date.now();
		const featureFiles = discoverFeatureFiles({
			testMatch: config.testMatch,
			configDir,
			filter: args.filter,
		});
		const discoveryMs = Date.now() - tDiscoveryStart;

		const collection = {
			totalMs: loadConfigMs + loadSpecMs + discoveryMs,
			loadConfigMs,
			loadSpecMs,
			discoveryMs,
		};
		const collectionMs = collection.totalMs;

		if (featureFiles.length === 0) {
			const patterns = config.testMatch ?? ["**/*.feature.ts"];
			console.log(
				`[orquestra] no feature files found.\n` +
					`            cwd:      ${configDir}\n` +
					`            patterns: ${JSON.stringify(patterns)}` +
					(args.filter ? `\n            filter:   ${JSON.stringify(args.filter)}` : "") +
					`\n            Hint: testMatch globs are resolved relative to the config directory; ` +
					`paths starting with "/" are treated as absolute.`,
			);
			return;
		}

		const debug = args.debug;
		// Debug mode forces a single worker — inspecting parallel forks creates
		// a port-pick-and-attach mess. The breakpoint experience needs to be
		// deterministic, so we make the call here instead of letting the user
		// shoot themselves in the foot.
		const requestedConcurrency = args.concurrency ? Number.parseInt(args.concurrency, 10) : config.concurrency ?? 1;
		const concurrency = debug ? 1 : requestedConcurrency;
		if (debug && requestedConcurrency !== 1) {
			console.log(`[orquestra] --debug: forcing concurrency=1 (was ${requestedConcurrency}).`);
		}
		const stopOnFail = args.stopOnFail;
		// 5x the slowest of the configured per-call budgets gives the manager a
		// safe upper bound for the wall-clock of a whole feature file.
		const slowestHookBudgetMs = Math.max(
			config.serverHookTimeoutMs ?? 60_000,
			config.eachHookTimeoutMs ?? 10_000,
			config.scenarioTimeoutMs ?? 5_000,
		);
		const featureTimeoutMs = args.featureTimeout ? Number.parseInt(args.featureTimeout, 10) : slowestHookBudgetMs * 5;
		const workerMemoryLimitMb = config.workerMemoryLimitMb;
		// CLI wins: `--detect-open-handles` and `--no-detect-open-handles`
		// override config.detectOpenHandles. Citty only sets `args.detectOpenHandles`
		// when the flag is passed, so `undefined` means "fall back to config".
		const detectOpenHandles = args.detectOpenHandles ?? config.detectOpenHandles ?? false;

		console.log(`[orquestra] running ${featureFiles.length} feature file(s) with concurrency=${concurrency}\n`);

		const configPath = args.config ? resolve(process.cwd(), args.config) : resolve(configDir, DEFAULT_CONFIG_FILE);

		const parallel = new ParallelRunner({
			config,
			configPath,
			configDir,
			spec,
			featureFiles,
			concurrency,
			stopOnFail,
			tsconfigPath,
			featureTimeoutMs,
			workerMemoryLimitMb,
			debug,
			detectOpenHandles,
			collectionMs,
			collection,
		});

		const { artifact, artifactPath, crashed, timings } = await parallel.run();
		printSummary(artifact, artifactPath);
		printTimings(timings);
		const failed = artifact.summary.failed > 0;
		const pendingCounts = !args.allowPending && artifact.summary.pending > 0;
		if (crashed || failed || pendingCounts) {
			if (pendingCounts && !failed && !crashed) {
				console.error(
					`[orquestra] ${artifact.summary.pending} pending scenario(s) — failing run. ` +
						`Use --allowPending to treat pending as success.`,
				);
			}
			process.exitCode = 1;
		}
	},
});

// ANSI helpers — kept inline to avoid a chalk dep. Used only for structural
// emphasis (bold headers, dim tags, status counts). Durations are intentionally
// uncolored — without an absolute threshold or historical baseline, any color
// would be a guess.
const c = {
	green: (s: string) => `\x1b[32m${s}\x1b[39m`,
	red: (s: string) => `\x1b[31m${s}\x1b[39m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
	gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
};

const TAG = c.dim("[orquestra]");

function printSummary(artifact: { summary: { passed: number; failed: number; pending: number } }, path: string): void {
	const parts: string[] = [];
	parts.push(c.green(`${artifact.summary.passed} passed`));
	parts.push(
		artifact.summary.failed > 0 ? c.red(`${artifact.summary.failed} failed`) : `${artifact.summary.failed} failed`,
	);
	parts.push(
		artifact.summary.pending > 0 ? c.gray(`${artifact.summary.pending} pending`) : `${artifact.summary.pending} pending`,
	);

	console.log(`\n${TAG} ${c.bold("done")}: ${parts.join(", ")}`);
	console.log(`${TAG} artifact: ${c.cyan(path)}`);
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(2)}s`;
	const m = Math.floor(s / 60);
	const remaining = s - m * 60;
	return `${m}m${remaining.toFixed(1)}s`;
}

function printTimings(timings: RunTimings): void {
	const label = (s: string) => c.gray(s.padEnd(18));

	const fileCount = Object.keys(timings.featureDurationsMs).length;
	const workersInfo =
		fileCount > 0
			? c.dim(
					`(${fileCount} file${fileCount === 1 ? "" : "s"} / ${timings.workerCount} worker${
						timings.workerCount === 1 ? "" : "s"
					})`,
				)
			: "";

	console.log(`\n${TAG} ${c.bold("timing")}:`);
	console.log(`  ${label("total")} ${c.bold(formatDuration(timings.totalMs))}`);
	if (timings.collectionMs > 0) {
		const breakdown = timings.collection
			? c.dim(
					`(config ${formatDuration(timings.collection.loadConfigMs)} · spec ${formatDuration(
						timings.collection.loadSpecMs,
					)} · discovery ${formatDuration(timings.collection.discoveryMs)})`,
				)
			: "";
		console.log(`  ${label("file collection")} ${formatDuration(timings.collectionMs)}  ${breakdown}`);
	}
	console.log(`  ${label("containers up")} ${formatDuration(timings.provisionMs)}`);
	console.log(`  ${label("workers startup")} ${formatDuration(timings.workerStartupMs)}`);
	console.log(`  ${label("scenarios")} ${formatDuration(timings.scenariosMs)}  ${workersInfo}`);
	if (timings.serverBoot.count > 0) {
		const sb = timings.serverBoot;
		const detail = c.dim(
			`(median ${formatDuration(sb.medianMs)} · p95 ${formatDuration(sb.p95Ms)} · ${sb.count} boot${
				sb.count === 1 ? "" : "s"
			} × ${formatDuration(sb.totalMs)} sum)`,
		);
		console.log(`  ${label("server boot avg")} ${formatDuration(sb.meanMs)}  ${detail}`);
	}
	console.log(`  ${label("containers down")} ${formatDuration(timings.deprovisionMs)}`);

	const slowest = Object.entries(timings.featureTimings)
		.sort((a, b) => b[1].totalMs - a[1].totalMs)
		.slice(0, 5);
	if (slowest.length === 0) return;

	console.log(`\n${TAG} ${c.bold("slowest features")} ${c.dim("(boot · run · td)")}`);
	const longestDur = Math.max(...slowest.map(([, t]) => t.totalMs));
	const padDur = formatDuration(longestDur).length;
	for (const [file, t] of slowest) {
		const main = formatDuration(t.totalMs).padStart(padDur);
		const detail = c.dim(
			`(${formatDuration(t.bootMs)} · ${formatDuration(t.scenariosMs)} · ${formatDuration(t.teardownMs)})`,
		);
		console.log(`  ${main}  ${basename(file)}  ${detail}`);
	}
}
