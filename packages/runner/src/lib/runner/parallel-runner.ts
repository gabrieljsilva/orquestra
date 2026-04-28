import {
	type ArtifactCollectionTimings,
	type ArtifactContainerTiming,
	type ArtifactServerBootStats,
	type ArtifactTimings,
	type FeatureTimings,
	GlobalOrquestra,
	type OrquestraArtifact,
	type OrquestraConfig,
	type OrquestraSpec,
} from "@orquestra/core";
import { attachTimings, generateArtifact, getRunnerVersion, writeArtifact } from "../artifact";
import { configToGlobalOrquestraOptions } from "./config-mapper";
import { appendOrphanFiles, recomputeOverallStatus } from "./orphan-files";
import { resolveOutputDir } from "./output-dir";
import { resolveReporters, runReporters } from "./reporters";
import { WorkerManager } from "./worker-manager";

export interface ParallelRunnerOptions {
	config: OrquestraConfig;
	configPath: string;
	configDir: string;
	spec: OrquestraSpec | null;
	featureFiles: string[];
	concurrency: number;
	stopOnFail: boolean;
	tsconfigPath?: string;
	featureTimeoutMs?: number;
	/** Soft memory cap (MB). Recycles a worker after a feature finishes if its heap exceeds this. */
	workerMemoryLimitMb?: number;
	/** Debug mode: force concurrency=1, emit source maps, fork worker with --inspect-brk. */
	debug?: boolean;
	/** Time spent before the runner — discovery, loadConfig, loadSpec, jiti warmup. */
	collectionMs?: number;
	/** Per-step breakdown of `collectionMs`, for performance debugging. */
	collection?: ArtifactCollectionTimings;
}

export interface RunTimings extends ArtifactTimings {
	featureDurationsMs: Record<string, number>;
	featureTimings: Record<string, FeatureTimings>;
}

function computeBootStats(timings: Record<string, FeatureTimings>): ArtifactServerBootStats {
	const boots = Object.values(timings)
		.map((t) => t.bootMs)
		.filter((n) => Number.isFinite(n))
		.sort((a, b) => a - b);
	if (boots.length === 0) {
		return { count: 0, totalMs: 0, meanMs: 0, medianMs: 0, p95Ms: 0 };
	}
	const total = boots.reduce((sum, n) => sum + n, 0);
	const median =
		boots.length % 2 === 1
			? boots[(boots.length - 1) / 2]
			: Math.round((boots[boots.length / 2 - 1] + boots[boots.length / 2]) / 2);
	const p95Idx = Math.min(boots.length - 1, Math.floor(0.95 * (boots.length - 1)));
	return {
		count: boots.length,
		totalMs: total,
		meanMs: Math.round(total / boots.length),
		medianMs: median,
		p95Ms: boots[p95Idx],
	};
}

export interface ParallelRunnerResult {
	artifact: OrquestraArtifact;
	artifactPath: string;
	crashed: boolean;
	timings: RunTimings;
}

export class ParallelRunner {
	private readonly options: ParallelRunnerOptions;

	constructor(options: ParallelRunnerOptions) {
		this.options = options;
	}

	async run(): Promise<ParallelRunnerResult> {
		const totalStartedAt = Date.now();
		const globalOrq = new GlobalOrquestra(configToGlobalOrquestraOptions(this.options.config));

		const provisionStartedAt = Date.now();
		await globalOrq.provision();
		const provisionMs = Date.now() - provisionStartedAt;
		const containerTimings: ArtifactContainerTiming[] = globalOrq
			.getContainerStartupTimings()
			.map((c) => ({ name: c.name, startupMs: c.startupMs }));

		let executionMs = 0;
		let deprovisionMs = 0;
		const executionStartedAt = Date.now();

		// Without explicit signal handlers, Ctrl+C / CI cancellation kills the
		// process before the `finally` runs and Docker testcontainers leak.
		let manager: WorkerManager | null = null;
		let teardownInProgress = false;
		const signalExitCode: Record<NodeJS.Signals, number> = {
			SIGINT: 130,
			SIGTERM: 143,
			SIGHUP: 129,
		} as Record<NodeJS.Signals, number>;
		const signalHandlers = new Map<NodeJS.Signals, () => void>();

		const onSignal = (signal: NodeJS.Signals) => async () => {
			if (teardownInProgress) return;
			teardownInProgress = true;
			console.error(`\n[orquestra] received ${signal}, tearing down...`);
			try {
				if (manager) await manager.requestShutdown();
				await globalOrq.deprovision();
			} catch (err) {
				console.error(`[orquestra] error during signal teardown: ${err}`);
			}
			process.exit(signalExitCode[signal] ?? 1);
		};

		for (const signal of Object.keys(signalExitCode) as NodeJS.Signals[]) {
			const handler = onSignal(signal);
			signalHandlers.set(signal, handler);
			process.on(signal, handler);
		}

		let workerResult: Awaited<ReturnType<WorkerManager["run"]>>;
		try {
			manager = new WorkerManager({
				configPath: this.options.configPath,
				featureFiles: this.options.featureFiles,
				concurrency: this.options.concurrency,
				stopOnFail: this.options.stopOnFail,
				tsconfigPath: this.options.tsconfigPath,
				featureTimeoutMs: this.options.featureTimeoutMs,
				workerMemoryLimitMb: this.options.workerMemoryLimitMb,
				debug: this.options.debug,
			});
			workerResult = await manager.run();
		} finally {
			executionMs = Date.now() - executionStartedAt;
			for (const [sig, handler] of signalHandlers) process.off(sig, handler);
			if (!teardownInProgress) {
				const deprovisionStartedAt = Date.now();
				await globalOrq.deprovision();
				deprovisionMs = Date.now() - deprovisionStartedAt;
			}
		}

		const artifact = generateArtifact({
			version: getRunnerVersion(),
			events: workerResult.events,
			hookEvents: workerResult.hookEvents,
			meta: workerResult.meta,
			spec: this.options.spec,
			featureDurationsMs: workerResult.featureDurationsMs,
			featureFilesByName: workerResult.featureFilesByName,
		});

		appendOrphanFiles(artifact, workerResult.failedFiles, workerResult.pendingFiles);
		recomputeOverallStatus(artifact);

		const collectionMs = this.options.collectionMs ?? 0;
		const totalMs = Date.now() - totalStartedAt + collectionMs;

		// Pure scenario time: from the first scenario emitting an event to
		// the last one. Everything else inside `executionMs` is per-file
		// boot/teardown overhead.
		const scenariosMs =
			workerResult.firstStepAt !== null && workerResult.lastStepAt !== null
				? workerResult.lastStepAt - workerResult.firstStepAt
				: 0;

		// Time between the manager starting and the first scenario being able
		// to run — fork + jiti import + first-feature boot of the leading
		// worker. (Subsequent workers' boot is masked by parallelism.)
		const workerStartupMs =
			workerResult.firstStepAt !== null ? Math.max(0, workerResult.firstStepAt - executionStartedAt) : executionMs;

		const serverBoot = computeBootStats(workerResult.featureTimings);

		// Annotate per-feature timings on the artifact (bound to the feature
		// by `file`, which we already track in `featureFilesByName`).
		for (const feature of artifact.features) {
			if (!feature.file) continue;
			const ft = workerResult.featureTimings[feature.file];
			if (ft) feature.timings = ft;
		}

		const artifactTimings: ArtifactTimings = {
			totalMs,
			collectionMs,
			provisionMs,
			executionMs,
			workerStartupMs,
			scenariosMs,
			deprovisionMs,
			workerCount: workerResult.workerCount,
			containers: containerTimings,
			serverBoot,
		};
		if (this.options.collection) {
			artifactTimings.collection = this.options.collection;
		}
		attachTimings(artifact, artifactTimings);

		const outputDir = resolveOutputDir(this.options.config, this.options.configDir);
		const artifactPath = writeArtifact({
			artifact,
			outputDir,
		});

		await runReporters(resolveReporters(this.options.config), artifact, {
			outputDir,
			artifactPath,
		});

		const timings: RunTimings = {
			...artifactTimings,
			featureDurationsMs: workerResult.featureDurationsMs,
			featureTimings: workerResult.featureTimings,
		};

		return {
			artifact,
			artifactPath,
			crashed: workerResult.crashed,
			timings,
		};
	}
}

// Helper para export similar ao Runner
export async function runParallel(options: ParallelRunnerOptions): Promise<ParallelRunnerResult> {
	const runner = new ParallelRunner(options);
	return runner.run();
}
