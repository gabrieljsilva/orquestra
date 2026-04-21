import {
	type Orquestra,
	type OrquestraArtifact,
	type OrquestraConfig,
	type OrquestraSpec,
	initOrquestra,
	resetOrquestraInstance,
} from "@orquestra/core";
import { generateArtifact, getRunnerVersion, writeArtifact } from "../artifact";
import { configToGlobalOptions } from "./config-mapper";
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
}

export interface ParallelRunnerResult {
	artifact: OrquestraArtifact;
	artifactPath: string;
	crashed: boolean;
}

export class ParallelRunner {
	private readonly options: ParallelRunnerOptions;

	constructor(options: ParallelRunnerOptions) {
		this.options = options;
	}

	async run(): Promise<ParallelRunnerResult> {
		resetOrquestraInstance();
		const globalOrq = initOrquestra(configToGlobalOptions(this.options.config));

		await globalOrq.provision();

		let workerResult: Awaited<ReturnType<WorkerManager["run"]>>;
		try {
			const manager = new WorkerManager({
				configPath: this.options.configPath,
				featureFiles: this.options.featureFiles,
				concurrency: this.options.concurrency,
				stopOnFail: this.options.stopOnFail,
			});
			workerResult = await manager.run();
		} finally {
			await globalOrq.deprovision();
		}

		const artifact = generateArtifact({
			version: getRunnerVersion(),
			events: workerResult.events,
			meta: workerResult.meta,
			spec: this.options.spec,
		});

		this.markPendingFeatures(artifact, workerResult.pendingFiles, workerResult.failedFiles);

		const outputDir = resolveOutputDir(this.options.config, this.options.configDir);
		const artifactPath = writeArtifact({
			artifact,
			outputDir,
		});

		await runReporters(resolveReporters(this.options.config), artifact, {
			outputDir,
			artifactPath,
		});

		return {
			artifact,
			artifactPath,
			crashed: workerResult.crashed,
		};
	}

	private markPendingFeatures(
		artifact: OrquestraArtifact,
		_pendingFiles: string[],
		_failedFiles: string[],
	): void {
		for (const feature of artifact.features) {
			if (feature.scenarios.length === 0) {
				feature.status = "pending";
			}
		}
	}
}

// Helper para export similar ao Runner
export async function runParallel(options: ParallelRunnerOptions): Promise<ParallelRunnerResult> {
	const runner = new ParallelRunner(options);
	return runner.run();
}

// Kept for compat: single-process (used in Fase 2 flow if concurrency === 1)
export type { Orquestra };
