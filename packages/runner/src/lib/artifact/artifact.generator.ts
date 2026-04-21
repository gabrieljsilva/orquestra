import type {
	ArtifactDomain,
	ArtifactFeature,
	ArtifactPersona,
	ArtifactScenario,
	ArtifactStep,
	ArtifactSummary,
	FeatureMeta,
	OrquestraArtifact,
	OrquestraSpec,
	StepEvent,
	StepStatus,
} from "@orquestra/core";

export interface ArtifactInput {
	version: string;
	events: ReadonlyArray<StepEvent>;
	meta: ReadonlyArray<FeatureMeta>;
	spec: OrquestraSpec | null;
}

export function generateArtifact(input: ArtifactInput): OrquestraArtifact {
	const features = buildFeatures(input.events, input.meta);
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

function buildFeatures(events: ReadonlyArray<StepEvent>, meta: ReadonlyArray<FeatureMeta>): ArtifactFeature[] {
	const eventsByFeature = groupBy(events, (e) => e.feature);

	return meta.map((m) => {
		const featureEvents = eventsByFeature.get(m.feature) ?? [];
		const scenarios = buildScenarios(featureEvents);
		const featureStatus = aggregateStatus(scenarios.map((s) => s.status));

		return {
			name: m.feature,
			domain: m.domain ?? null,
			context: m.context ?? null,
			as: m.as,
			I: m.I,
			so: m.so,
			status: featureStatus,
			scenarios,
		};
	});
}

function buildScenarios(events: StepEvent[]): ArtifactScenario[] {
	const eventsByScenario = groupBy(events, (e) => e.scenario);
	const scenarios: ArtifactScenario[] = [];

	for (const [scenarioName, scenarioEvents] of eventsByScenario) {
		const steps: ArtifactStep[] = scenarioEvents.map((e) => ({
			keyword: e.keyword,
			name: e.stepName,
			status: e.status,
			durationMs: e.durationMs,
			error: e.error,
		}));

		scenarios.push({
			name: scenarioName,
			status: aggregateStatus(steps.map((s) => s.status)),
			steps,
		});
	}

	return scenarios;
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
