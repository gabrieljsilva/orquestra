import type { FeatureMeta } from "../../types/reporting";
import type { StepEvent } from "../../types/shard-manager/shard-manager.types";
import { OrquestraReporter } from "./orquestra-reporter";

const c = {
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[39m`,
	red: (s: string) => `\x1b[31m${s}\x1b[39m`,
	gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
};

const SYMBOL: Record<StepEvent["status"], string> = {
	success: "✓",
	failed: "✗",
	pending: "○",
};

const UNKNOWN_SYMBOL = "?";

interface RenderedStep {
	stepId: string;
	name: string;
	keyword: StepEvent["keyword"];
	status: StepEvent["status"];
	error?: StepEvent["error"];
	order: number;
}

export class OrquestraConsoleReporter extends OrquestraReporter {
	run(events: StepEvent[], meta: FeatureMeta[]): void {
		if (!events.length) return;

		const metaByFeature = new Map(meta.map((m) => [m.feature, m]));
		const { byFeature, featureOrder } = this.aggregate(events);

		for (const featureName of featureOrder) {
			const scMap = byFeature.get(featureName);
			if (!scMap) continue;
			this.printFeature(featureName, scMap, metaByFeature.get(featureName));
		}
	}

	private aggregate(events: StepEvent[]): {
		byFeature: Map<string, Map<string, RenderedStep[]>>;
		featureOrder: string[];
	} {
		const latestByStep = new Map<string, StepEvent>();
		const orderByStep = new Map<string, number>();
		let seq = 0;

		for (const evt of events) {
			latestByStep.set(evt.stepId, evt);
			if (!orderByStep.has(evt.stepId)) orderByStep.set(evt.stepId, ++seq);
		}

		const byFeature = new Map<string, Map<string, RenderedStep[]>>();
		const featureOrder: string[] = [];

		for (const [stepId, evt] of latestByStep) {
			let featureMap = byFeature.get(evt.feature);
			if (!featureMap) {
				featureMap = new Map();
				byFeature.set(evt.feature, featureMap);
				featureOrder.push(evt.feature);
			}
			const steps = featureMap.get(evt.scenario) ?? [];
			steps.push({
				stepId,
				name: evt.stepName,
				keyword: evt.keyword,
				status: evt.status,
				error: evt.error,
				order: orderByStep.get(stepId) || 0,
			});
			featureMap.set(evt.scenario, steps);
		}

		return { byFeature, featureOrder };
	}

	private printFeature(featureName: string, scMap: Map<string, RenderedStep[]>, meta: FeatureMeta | undefined): void {
		console.log(c.bold(`Feature: ${featureName}`));
		if (meta) {
			console.log(`  As ${this.prefixArticle(meta.as)}`);
			console.log(`  I ${meta.I}`);
			console.log(`  So that ${meta.so}`);
		}
		console.log("");

		const scenarios = Array.from(scMap.entries());
		for (let i = 0; i < scenarios.length; i++) {
			const [scenarioName, steps] = scenarios[i];
			this.printScenario(scenarioName, steps);
			if (i < scenarios.length - 1) console.log("");
		}
	}

	private printScenario(scenarioName: string, steps: RenderedStep[]): void {
		steps.sort((a, b) => a.order - b.order);
		const hasFail = steps.some((s) => s.status === "failed");
		const allOk = !hasFail && steps.every((s) => s.status === "success");

		const scenarioLabel = `  Scenario: ${scenarioName}`;
		console.log(allOk ? c.green(scenarioLabel) : scenarioLabel);

		for (let i = 0; i < steps.length; i++) {
			const step = steps[i];
			const isLast = i === steps.length - 1;
			const branch = isLast ? "└──" : "├──";
			const symbol = SYMBOL[step.status] ?? UNKNOWN_SYMBOL;
			const line = `    ${branch} ${symbol} ${step.keyword} ${step.name}`;

			if (step.status === "failed") {
				console.log(c.red(line));
				if (step.error?.message) console.log(c.red(`        → ${step.error.message}`));
			} else if (step.status === "pending") {
				console.log(c.gray(line));
			} else if (allOk) {
				console.log(c.green(line));
			} else {
				console.log(c.gray(line));
			}
		}
	}

	private prefixArticle(as: string): string {
		const trimmed = as.trim();
		if (!trimmed) return trimmed;
		const lower = trimmed.toLowerCase();
		if (/^(an?|the)\s/.test(lower)) return trimmed;
		const startsWithVowel = /^[aeiou]/i.test(trimmed);
		return `${startsWithVowel ? "an" : "a"} ${trimmed}`;
	}
}
