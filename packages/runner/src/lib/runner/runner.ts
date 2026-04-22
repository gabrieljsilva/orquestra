import { test } from "node:test";
import {
	type Orquestra,
	type OrquestraArtifact,
	type OrquestraConfig,
	type OrquestraSpec,
	initOrquestra,
	resetOrquestraInstance,
} from "@orquestra/core";
import { generateArtifact, getRunnerVersion, writeArtifact } from "../artifact";
import { type Jiti, createOrquestraJiti } from "../transform";
import { configToOrquestraOptions } from "./config-mapper";
import { resolveOutputDir } from "./output-dir";
import { resolveReporters, runReporters } from "./reporters";
import { installNodeTestReporterFilter, uninstallNodeTestReporterFilter } from "./silence-node-test";

export interface RunnerOptions {
	config: OrquestraConfig;
	spec: OrquestraSpec | null;
	featureFiles: string[];
	configDir: string;
	tsconfigPath?: string;
}

export interface RunnerResult {
	orquestra: Orquestra;
	artifact: OrquestraArtifact;
	artifactPath: string;
}

export class Runner {
	private readonly config: OrquestraConfig;
	private readonly spec: OrquestraSpec | null;
	private readonly featureFiles: string[];
	private readonly configDir: string;
	private readonly jiti: Jiti;

	constructor(options: RunnerOptions) {
		this.config = options.config;
		this.spec = options.spec;
		this.featureFiles = options.featureFiles;
		this.configDir = options.configDir;
		this.jiti = createOrquestraJiti({
			id: import.meta.url,
			cwd: options.configDir,
			tsconfigPath: options.tsconfigPath,
		});
	}

	async run(): Promise<RunnerResult> {
		resetOrquestraInstance();

		if (!process.env.ORQUESTRA_WORKER_ID) {
			process.env.ORQUESTRA_WORKER_ID = "0";
		}

		const orq = initOrquestra(configToOrquestraOptions(this.config));

		await orq.start();

		// Filter node:test reporter noise only after bootstrap so boot errors
		// emitted via stdout are not swallowed.
		installNodeTestReporterFilter();

		try {
			await this.importFeatureFiles();
			await this.executeScenarios(orq);
		} finally {
			uninstallNodeTestReporterFilter();
			await orq.teardown();
		}

		const artifact = generateArtifact({
			version: getRunnerVersion(),
			events: orq.getEvents(),
			meta: orq.getFeatureMeta(),
			spec: this.spec,
		});

		const outputDir = resolveOutputDir(this.config, this.configDir);
		const outputPath = writeArtifact({ artifact, outputDir });

		await runReporters(resolveReporters(this.config), artifact, {
			outputDir,
			artifactPath: outputPath,
		});

		return { orquestra: orq, artifact, artifactPath: outputPath };
	}

	private async importFeatureFiles(): Promise<void> {
		for (const file of this.featureFiles) {
			await this.jiti.import(file);
		}
	}

	private async executeScenarios(orq: Orquestra): Promise<void> {
		const features = orq.getBddContainer().getFeatures();

		for (const feature of features) {
			const scenarios = feature.getScenarios();
			for (const scenario of scenarios) {
				const name = `${feature.getName()} > ${scenario.name}`;
				await test(name, async () => {
					await feature.withRegistry(() => scenario.runAllSteps());
				});
			}
		}
	}

	getSpec(): OrquestraSpec | null {
		return this.spec;
	}
}
