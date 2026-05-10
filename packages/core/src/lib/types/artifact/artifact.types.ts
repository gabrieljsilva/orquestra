import type { ArtifactAttachment, ArtifactLog } from "../attachments";
import type { StepStatus } from "../events";
import type { HookFailure } from "../lifecycle/hook.types";
import type { ArtifactOpenHandle } from "./open-handles.types";

export interface ArtifactPersona {
	name: string;
	features: string[];
}

export interface ArtifactDomain {
	name: string;
	context: string;
	features: string[];
}

export interface ArtifactStep {
	keyword: "Given" | "When" | "Then";
	name: string;
	status: StepStatus;
	durationMs?: number;
	error?: { message: string; stack?: string };
	attachments?: ArtifactAttachment[];
	logs?: ArtifactLog[];
}

export interface ArtifactScenario {
	name: string;
	status: StepStatus;
	steps: ArtifactStep[];
	hookFailures?: HookFailure[];
	/** Sum of all step durations + hookFailure durations for this scenario. */
	durationMs?: number;
}

/**
 * Wall-clock breakdown of a single feature file inside a worker.
 *
 * - `bootMs`     — from `feature:assign` until afterStartServer hooks finish
 *                  (import + service resolve + beforeStartServer + http boot +
 *                  afterStartServer). This is the per-file overhead that
 *                  doesn't scale with how many scenarios you have.
 * - `scenariosMs`— from the first scenario starting to the last scenario
 *                  finishing. Pure execution.
 * - `teardownMs` — from beforeStopServer hooks until the worker is done
 *                  with the file.
 * - `totalMs`    — convenience sum (matches the previous `durationMs`).
 */
export interface FeatureTimings {
	bootMs: number;
	scenariosMs: number;
	teardownMs: number;
	totalMs: number;
}

export interface ArtifactFeature {
	name: string;
	domain: string | null;
	context: string | null;
	as: string;
	I: string;
	so: string;
	status: StepStatus;
	scenarios: ArtifactScenario[];
	hookFailures?: HookFailure[];
	file?: string;
	crashed?: boolean;
	/** Wall-clock time the file took inside the worker (assign → done).
	 * Kept for back-compat; equals `timings.totalMs` when present. */
	durationMs?: number;
	timings?: FeatureTimings;
	/**
	 * Async resources created during this feature that were still keeping the
	 * event loop alive when the feature finished. Populated only when the run
	 * was invoked with `--detect-open-handles` (or `detectOpenHandles: true`).
	 */
	openHandles?: ArtifactOpenHandle[];
}

export interface ArtifactSummary {
	totalFeatures: number;
	totalScenarios: number;
	passed: number;
	failed: number;
	pending: number;
	/**
	 * Number of features that leaked at least one async resource. Present only
	 * when the run was invoked with open-handle detection enabled — otherwise
	 * absent so consumers don't read `0` as "verified zero leaks".
	 */
	featuresWithOpenHandles?: number;
	/**
	 * Total leaked handles across all features. Same opt-in semantics as
	 * `featuresWithOpenHandles`.
	 */
	totalOpenHandles?: number;
}

export interface ArtifactContainerTiming {
	name: string;
	startupMs: number;
}

export interface ArtifactServerBootStats {
	/** Number of feature files that recorded a boot. */
	count: number;
	/** Sum of all `feature.timings.bootMs`. */
	totalMs: number;
	meanMs: number;
	medianMs: number;
	p95Ms: number;
}

export interface ArtifactCollectionTimings {
	/** Sum of the three breakdowns. */
	totalMs: number;
	/** loadConfig — includes jiti+swc warmup the first time it runs. */
	loadConfigMs: number;
	/** loadSpec — reuses the same jiti instance, so this is purely the spec import. */
	loadSpecMs: number;
	/** globSync over `testMatch`. */
	discoveryMs: number;
}

export interface ArtifactTimings {
	/** Wall-clock total: from CLI entry to artifact written. */
	totalMs: number;
	/** Discovery + loadConfig + loadSpec + jiti warmup, before the runner starts. */
	collectionMs: number;
	/** Per-step breakdown of `collectionMs` for performance debugging. */
	collection?: ArtifactCollectionTimings;
	/** Containers up (provision). */
	provisionMs: number;
	/** Manager.run() wall-clock — spawn + drain. Includes workerStartup + scenarios + per-file overhead. */
	executionMs: number;
	/** Time from the manager starting until the first scenario emits an event. */
	workerStartupMs: number;
	/** Time from the first scenario event to the last — pure scenario execution. */
	scenariosMs: number;
	/** Containers down (deprovision). */
	deprovisionMs: number;
	workerCount: number;
	containers: ArtifactContainerTiming[];
	/** Aggregated stats over per-feature `bootMs`. */
	serverBoot: ArtifactServerBootStats;
}

export interface OrquestraArtifact {
	orquestraVersion: string;
	generatedAt: string;
	status: StepStatus;
	glossary: Record<string, string>;
	personas: ArtifactPersona[];
	domains: ArtifactDomain[];
	features: ArtifactFeature[];
	summary: ArtifactSummary;
	timings?: ArtifactTimings;
}
