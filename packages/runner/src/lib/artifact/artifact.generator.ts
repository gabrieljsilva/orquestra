import type {
	ArtifactDomain,
	ArtifactFeature,
	ArtifactPersona,
	ArtifactScenario,
	ArtifactStep,
	ArtifactSummary,
	ArtifactTimings,
	FeatureMeta,
	HookEvent,
	HookFailure,
	OrquestraArtifact,
	OrquestraSpec,
	StepEvent,
	StepStatus,
} from "@orquestra/core";

export interface ArtifactInput {
	version: string;
	events: ReadonlyArray<StepEvent>;
	hookEvents?: ReadonlyArray<HookEvent>;
	meta: ReadonlyArray<FeatureMeta>;
	spec: OrquestraSpec | null;
	/** Per-feature wall-clock duration keyed by absolute file path. */
	featureDurationsMs?: Record<string, number>;
	/** Map of feature name → file path. Used to bind featureDurationsMs to the
	 * artifact features (which are keyed by name). */
	featureFilesByName?: Record<string, string>;
}

export function generateArtifact(input: ArtifactInput): OrquestraArtifact {
	const features = buildFeatures(
		input.events,
		input.hookEvents ?? [],
		input.meta,
		input.featureDurationsMs ?? {},
		input.featureFilesByName ?? {},
	);
	const personas = buildPersonas(features);
	const domains = buildDomains(features, input.spec);
	const summary = buildSummary(features);
	const status = computeOverallStatus(features);

	return {
		orquestraVersion: input.version,
		generatedAt: new Date().toISOString(),
		status,
		glossary: input.spec?.glossary ?? {},
		personas,
		domains,
		features,
		summary,
	};
}

export function attachTimings(artifact: OrquestraArtifact, timings: ArtifactTimings): void {
	artifact.timings = timings;
}

function buildFeatures(
	events: ReadonlyArray<StepEvent>,
	hookEvents: ReadonlyArray<HookEvent>,
	meta: ReadonlyArray<FeatureMeta>,
	featureDurationsMs: Record<string, number>,
	featureFilesByName: Record<string, string>,
): ArtifactFeature[] {
	const eventsByFeature = groupBy(events, (e) => e.feature);
	const hookEventsByFeature = groupBy(
		hookEvents.filter((h) => !!h.feature),
		(h) => h.feature as string,
	);

	return meta.map((m) => {
		const featureEvents = eventsByFeature.get(m.feature) ?? [];
		const featureHookEvents = hookEventsByFeature.get(m.feature) ?? [];

		const fileLevelHooks = featureHookEvents.filter((h) => !h.scenario);
		const scenarioLevelHooks = featureHookEvents.filter((h) => !!h.scenario);

		const scenarios = buildScenarios(featureEvents, scenarioLevelHooks);
		const featureHookFailures = fileLevelHooks.map(toHookFailure);
		const featureStatus = aggregateFeatureStatus(scenarios, featureHookFailures);

		const result: ArtifactFeature = {
			name: m.feature,
			domain: m.domain ?? null,
			context: m.context ?? null,
			as: m.as,
			I: m.I,
			so: m.so,
			status: featureStatus,
			scenarios,
		};

		if (featureHookFailures.length > 0) {
			result.hookFailures = featureHookFailures;
		}

		const file = featureFilesByName[m.feature];
		if (file) {
			result.file = file;
			const wallClock = featureDurationsMs[file];
			if (typeof wallClock === "number") {
				result.durationMs = wallClock;
			}
		}

		return result;
	});
}

function buildScenarios(events: StepEvent[], scenarioHookEvents: HookEvent[]): ArtifactScenario[] {
	const eventsByScenario = groupBy(events, (e) => e.scenario);
	const hooksByScenario = groupBy(scenarioHookEvents, (h) => h.scenario as string);
	const scenarios: ArtifactScenario[] = [];
	const seen = new Set<string>();

	for (const [scenarioName, scenarioEvents] of eventsByScenario) {
		const steps: ArtifactStep[] = scenarioEvents.map((e) => ({
			keyword: e.keyword,
			name: e.stepName,
			status: e.status,
			durationMs: e.durationMs,
			error: e.error,
		}));

		const hookFailures = (hooksByScenario.get(scenarioName) ?? []).map(toHookFailure);
		const stepStatus = aggregateStatus(steps.map((s) => s.status));
		const status: StepStatus = hookFailures.length > 0 ? "failed" : stepStatus;

		const scenario: ArtifactScenario = {
			name: scenarioName,
			status,
			steps,
			durationMs: sumDurations(steps, hookFailures),
		};

		if (hookFailures.length > 0) {
			scenario.hookFailures = hookFailures;
		}

		scenarios.push(scenario);
		seen.add(scenarioName);
	}

	for (const [scenarioName, hooks] of hooksByScenario) {
		if (seen.has(scenarioName)) continue;
		scenarios.push({
			name: scenarioName,
			status: "failed",
			steps: [],
			hookFailures: hooks.map(toHookFailure),
		});
	}

	return scenarios;
}

function aggregateFeatureStatus(scenarios: ArtifactScenario[], featureHookFailures: HookFailure[]): StepStatus {
	if (featureHookFailures.length > 0) return "failed";
	return aggregateStatus(scenarios.map((s) => s.status));
}

function sumDurations(steps: ArtifactStep[], hookFailures: HookFailure[]): number {
	let total = 0;
	for (const s of steps) total += s.durationMs ?? 0;
	for (const h of hookFailures) total += h.durationMs ?? 0;
	return total;
}

function toHookFailure(event: HookEvent): HookFailure {
	const failure: HookFailure = {
		hookName: event.hookName,
		error: event.error,
	};
	if (event.feature) failure.feature = event.feature;
	if (event.scenario) failure.scenario = event.scenario;
	if (event.durationMs !== undefined) failure.durationMs = event.durationMs;
	return failure;
}

function buildPersonas(features: ArtifactFeature[]): ArtifactPersona[] {
	const byPersona = new Map<string, string[]>();

	for (const feature of features) {
		const list = byPersona.get(feature.as) ?? [];
		list.push(feature.name);
		byPersona.set(feature.as, list);
	}

	return Array.from(byPersona.entries())
		.map(([name, featureNames]) => ({ name, features: featureNames }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function buildDomains(features: ArtifactFeature[], spec: OrquestraSpec | null): ArtifactDomain[] {
	const declaredDomains = spec?.domains ?? [];
	const featuresByDomain = new Map<string, string[]>();

	for (const feature of features) {
		if (!feature.domain) continue;
		const list = featuresByDomain.get(feature.domain) ?? [];
		list.push(feature.name);
		featuresByDomain.set(feature.domain, list);
	}

	return declaredDomains.map((d) => ({
		name: d.name,
		context: d.context,
		features: featuresByDomain.get(d.name) ?? [],
	}));
}

function buildSummary(features: ArtifactFeature[]): ArtifactSummary {
	let totalScenarios = 0;
	let passed = 0;
	let failed = 0;
	let pending = 0;

	for (const feature of features) {
		for (const scenario of feature.scenarios) {
			totalScenarios += 1;
			if (scenario.status === "success") passed += 1;
			else if (scenario.status === "failed") failed += 1;
			else pending += 1;
		}
	}

	return {
		totalFeatures: features.length,
		totalScenarios,
		passed,
		failed,
		pending,
	};
}

function computeOverallStatus(features: ArtifactFeature[]): StepStatus {
	const statuses = features.flatMap((f) => f.scenarios.map((s) => s.status));
	const featureLevelHasFailure = features.some((f) => (f.hookFailures?.length ?? 0) > 0);
	if (featureLevelHasFailure) return "failed";
	return aggregateStatus(statuses);
}

function aggregateStatus(statuses: StepStatus[]): StepStatus {
	if (statuses.length === 0) return "pending";
	if (statuses.some((s) => s === "failed")) return "failed";
	if (statuses.every((s) => s === "success")) return "success";
	return "pending";
}

function groupBy<T, K>(arr: ReadonlyArray<T>, keyFn: (item: T) => K): Map<K, T[]> {
	const map = new Map<K, T[]>();
	for (const item of arr) {
		const key = keyFn(item);
		const list = map.get(key) ?? [];
		list.push(item);
		map.set(key, list);
	}
	return map;
}
