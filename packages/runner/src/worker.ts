import { createHash } from "node:crypto";
import type { Feature, HookFailure, Scenario, StepEvent, WorkerOrquestra } from "@orquestra/core";
import { BddRunner, initOrquestra, resetOrquestraInstance } from "@orquestra/core";
import { spilloverStepEvent } from "./lib/attachments/spillover";
import { loadConfig } from "./lib/loaders/config.loader";
import { configToWorkerOrquestraOptions } from "./lib/runner/config-mapper";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./lib/runner/ipc-protocol";
import { readHeapUsedBytes } from "./lib/runner/memory-monitor";
import { resolveOutputDir } from "./lib/runner/output-dir";
import { resolveScenarioTimeout, runScenarioBody } from "./lib/runner/scenario-runner";
import { createOrquestraJiti } from "./lib/transform";

const DEFAULT_SCENARIO_TIMEOUT_MS = 5_000;

function send(msg: WorkerToMainMessage): void {
	if (process.send) process.send(msg);
}

function errorPayload(err: any): { message: string; stack?: string } {
	return { message: String(err?.message ?? err), stack: err?.stack };
}

function snapshotEnv(): Record<string, string | undefined> {
	return { ...process.env };
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
	for (const k of Object.keys(process.env)) {
		if (!(k in snapshot)) {
			delete process.env[k];
		}
	}
	for (const [k, v] of Object.entries(snapshot)) {
		if (v === undefined) {
			delete process.env[k];
		} else {
			process.env[k] = v;
		}
	}
}

async function main() {
	const configPath = process.argv[2];
	const workerId = process.argv[3];
	const tsconfigPath = process.argv[4] || undefined;

	if (!configPath || workerId === undefined) {
		console.error("[worker] missing args: configPath and workerId required");
		process.exit(1);
	}

	process.env.ORQUESTRA_WORKER_ID = workerId;

	const { config, configDir } = await loadConfig(configPath, { tsconfigPath });

	const debugMode = process.env.ORQUESTRA_DEBUG === "1";
	const jiti = createOrquestraJiti({
		id: import.meta.url,
		cwd: configDir,
		tsconfigPath,
		// In debug runs we want breakpoints in .ts to land. Inline source maps
		// piggy-back on V8's --enable-source-maps without writing extra files.
		sourceMaps: debugMode ? "inline" : false,
		// The fs cache is keyed by source-content hash and ignores transform
		// options, so a previous non-debug run would happily serve us cached
		// JS *without* the source map embedded — and breakpoints would land
		// on the compiled output instead of the .ts. Disable the cache for
		// debug runs to force a fresh transpile (with the inline map).
		fsCache: !debugMode,
	});

	const envSnapshot = snapshotEnv();

	const scenarioTimeoutDefaultMs = config.scenarioTimeoutMs ?? DEFAULT_SCENARIO_TIMEOUT_MS;
	const reportHeap = (config.workerMemoryLimitMb ?? 0) > 0;
	const outputDir = resolveOutputDir(config, configDir);
	const inlineThresholdBytes = config.inlineThresholdBytes;

	const processFeature = async (file: string) => {
		const t0 = Date.now();
		let tReady = t0;
		let tScenariosStart = 0;
		let tScenariosEnd = 0;
		let tTeardownStart = 0;

		restoreEnv(envSnapshot);

		resetOrquestraInstance();
		let orq: WorkerOrquestra;
		try {
			orq = initOrquestra(configToWorkerOrquestraOptions(config));
		} catch (err) {
			const tEnd = Date.now();
			send({
				type: "feature:failed",
				file,
				error: errorPayload(err),
				timings: { bootMs: tEnd - t0, scenariosMs: 0, teardownMs: 0, totalMs: tEnd - t0 },
				heapUsedBytes: reportHeap ? readHeapUsedBytes() : undefined,
			});
			return;
		}

		let firstError: { message: string; stack?: string } | null = null;
		let importSucceeded = false;
		let bootAttempted = false;

		try {
			await jiti.import(file);
			importSucceeded = true;
		} catch (err) {
			firstError = errorPayload(err);
		}

		const featuresInFile = importSucceeded ? orq.getBddContainer().getFeatures() : [];

		if (importSucceeded) {
			const beforeStartFailures = await orq.runHooks("beforeStartServer", "FIFO");
			emitFileHookFailures(beforeStartFailures, file, featuresInFile);

			if (beforeStartFailures.length > 0) {
				firstError ??= beforeStartFailures[0].error;
			} else {
				let bootSucceeded = false;
				try {
					bootAttempted = true;
					await orq.boot();
					bootSucceeded = true;
				} catch (err) {
					firstError ??= errorPayload(err);
				}

				if (bootSucceeded) {
					const afterStartFailures = await orq.runHooks("afterStartServer", "FIFO");
					emitFileHookFailures(afterStartFailures, file, featuresInFile);
					tReady = Date.now();

					if (afterStartFailures.length > 0) {
						firstError ??= afterStartFailures[0].error;
					} else {
						tScenariosStart = Date.now();
						try {
							for (const feature of featuresInFile) {
								await executeFeature(orq, feature, scenarioTimeoutDefaultMs, {
									outputDir,
									inlineThresholdBytes,
								});
							}

							for (const meta of orq.getFeatureMeta()) {
								send({ type: "feature:meta", meta, file });
							}
						} catch (err) {
							firstError ??= errorPayload(err);
						}
						tScenariosEnd = Date.now();
					}
				}
			}
		}

		tTeardownStart = Date.now();
		const stopFailures = await orq.runHooks("beforeStopServer", "LIFO");
		emitFileHookFailures(stopFailures, file, featuresInFile);
		if (stopFailures.length > 0) {
			firstError ??= stopFailures[0].error;
		}

		if (bootAttempted) {
			try {
				await orq.shutdown();
			} catch (err) {
				console.error(`[worker] shutdown error in "${file}":`, err);
				// Surface teardown failures to the artifact rather than only
				// to stderr — without this, a leaking HTTP server / service
				// would silently pass CI.
				firstError ??= errorPayload(err);
			}
		}

		const tDone = Date.now();
		const timings = {
			bootMs: tReady - t0,
			scenariosMs: tScenariosEnd > tScenariosStart ? tScenariosEnd - tScenariosStart : 0,
			teardownMs: tDone - tTeardownStart,
			totalMs: tDone - t0,
		};

		const heapUsedBytes = reportHeap ? readHeapUsedBytes() : undefined;
		if (firstError) {
			send({ type: "feature:failed", file, error: firstError, timings, heapUsedBytes });
		} else {
			send({ type: "feature:done", file, timings, heapUsedBytes });
		}
	};

	let processingPromise: Promise<void> | null = null;
	let shutdownRequested = false;

	const drainAndExit = async (code: number): Promise<void> => {
		if (shutdownRequested) return;
		shutdownRequested = true;
		try {
			if (processingPromise) {
				// A feature in flight has already booted services / opened http
				// server. Wait for processFeature to run its teardown so we
				// don't leak ports / containers / open handles.
				await processingPromise;
			}
		} catch {
			// errors are already reported via IPC by processFeature
		}
		send({ type: "worker:done" });
		process.exit(code);
	};

	process.on("message", (msg: MainToWorkerMessage) => {
		if (msg.type === "feature:assign") {
			if (shutdownRequested) return;
			processingPromise = processFeature(msg.file).finally(() => {
				processingPromise = null;
			});
			processingPromise.then(() => {
				if (!shutdownRequested) send({ type: "ready" });
			});
		} else if (msg.type === "shutdown") {
			void drainAndExit(0);
		}
	});

	const onSignal = (signal: NodeJS.Signals) => () => {
		const code = signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 129;
		void drainAndExit(code);
	};
	process.on("SIGINT", onSignal("SIGINT"));
	process.on("SIGTERM", onSignal("SIGTERM"));
	process.on("SIGHUP", onSignal("SIGHUP"));

	send({ type: "ready" });
}

function emitFileHookFailures(failures: HookFailure[], file: string, features: ReadonlyArray<Feature>): void {
	if (failures.length === 0) return;

	for (const failure of failures) {
		if (features.length === 0) {
			send({
				type: "hook:event",
				event: {
					hookName: failure.hookName,
					file,
					error: failure.error,
					durationMs: failure.durationMs,
				},
			});
			continue;
		}

		for (const feature of features) {
			send({
				type: "hook:event",
				event: {
					hookName: failure.hookName,
					file,
					feature: feature.getName(),
					error: failure.error,
					durationMs: failure.durationMs,
				},
			});
		}
	}
}

interface AttachmentSpilloverConfig {
	outputDir: string;
	inlineThresholdBytes?: number;
}

async function executeFeature(
	orq: WorkerOrquestra,
	feature: Feature,
	defaultTimeoutMs: number,
	spillover: AttachmentSpilloverConfig,
): Promise<void> {
	const knownEventCounts = new Map<string, number>();
	const featureName = feature.getName();
	const featureHookFailures: HookFailure[] = [];

	const beforeFeatureFailures = await orq.runHooks("beforeEachFeature", "FIFO");
	for (const failure of beforeFeatureFailures) {
		send({
			type: "hook:event",
			event: { hookName: failure.hookName, feature: featureName, error: failure.error, durationMs: failure.durationMs },
		});
	}
	featureHookFailures.push(...beforeFeatureFailures);

	if (beforeFeatureFailures.length === 0) {
		for (const scenario of feature.getScenarios() as ReadonlyArray<Scenario<any>>) {
			const label = `${featureName} > ${scenario.name}`;
			const scenarioHookFailures: HookFailure[] = [];

			const beforeFailures = await orq.runHooks("beforeEachScenario", "FIFO");
			scenarioHookFailures.push(...beforeFailures);

			let scenarioOutcome: { error: { message: string; stack?: string } | null } = { error: null };
			if (beforeFailures.length === 0) {
				const timeoutMs = resolveScenarioTimeout(defaultTimeoutMs, feature.timeoutMs, scenario.timeoutMs);
				scenarioOutcome = await runScenarioBody(
					label,
					() => feature.withRegistry(() => BddRunner.runScenario(scenario)),
					timeoutMs,
				);
			}

			// afterEachScenario runs even if the body timed out or threw — same
			// contract as Vitest: per-scenario teardown gets its chance.
			const afterFailures = await orq.runHooks("afterEachScenario", "LIFO");
			scenarioHookFailures.push(...afterFailures);

			// If the body errored without any step recording a "failed" event
			// (e.g. the body timed out while a step was awaiting), synthesize
			// one so the artifact reflects the cenario as failed instead of
			// silently aggregating to success/pending.
			if (scenarioOutcome.error) {
				const newEvents = feature.getEvents().slice(knownEventCounts.get(featureName) ?? 0);
				const sawFailedStep = newEvents.some((e) => e.scenario === scenario.name && e.status === "failed");
				if (!sawFailedStep) {
					feature.pushEvent(buildScenarioBodyFailureEvent(featureName, scenario.name, scenarioOutcome.error));
				}
			}

			const events = feature.getEvents();
			const prevCount = knownEventCounts.get(featureName) ?? 0;
			for (let i = prevCount; i < events.length; i++) {
				const evt = events[i];
				const processed = evt.attachments?.length
					? spilloverStepEvent(evt, scenarioIdOf(evt.feature, evt.scenario), spillover)
					: evt;
				send({ type: "step:event", event: processed });
			}
			knownEventCounts.set(featureName, events.length);

			for (const failure of scenarioHookFailures) {
				send({
					type: "hook:event",
					event: {
						hookName: failure.hookName,
						feature: featureName,
						scenario: scenario.name,
						error: failure.error,
						durationMs: failure.durationMs,
					},
				});
			}
		}
	}

	const afterFeatureFailures = await orq.runHooks("afterEachFeature", "LIFO");
	for (const failure of afterFeatureFailures) {
		send({
			type: "hook:event",
			event: { hookName: failure.hookName, feature: featureName, error: failure.error, durationMs: failure.durationMs },
		});
	}
}

function scenarioIdOf(featureName: string, scenarioName: string): string {
	return createHash("sha1").update(`${featureName}${scenarioName}`).digest("hex");
}

/**
 * Synthetic step event for scenario bodies that errored without any step
 * recording a `failed` status — the typical case is a step that hangs and
 * gets cut off by the scenario timeout. Keyword is "Then" by convention
 * (a closing assertion) and stepName makes the synthetic origin explicit.
 */
function buildScenarioBodyFailureEvent(
	feature: string,
	scenario: string,
	error: { message: string; stack?: string },
): StepEvent {
	const stepId = createHash("sha1").update(`${feature}${scenario}<scenario body>`).digest("hex");
	return {
		feature,
		scenario,
		stepId,
		stepName: "<scenario body>",
		keyword: "Then",
		status: "failed",
		error,
	};
}

main().catch((err) => {
	console.error("[worker] fatal:", err);
	process.exit(1);
});
