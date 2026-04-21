import type { ArtifactFeature, ArtifactScenario, ArtifactStep, OrquestraArtifact } from "../../types/artifact";
import type { StepStatus } from "../../types/events";
import { OrquestraReporter } from "./orquestra-reporter";

const c = {
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[39m`,
	red: (s: string) => `\x1b[31m${s}\x1b[39m`,
	gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
};

const SYMBOL: Record<StepStatus, string> = {
	success: "✓",
	failed: "✗",
	pending: "○",
};

export class OrquestraConsoleReporter extends OrquestraReporter {
	run(artifact: OrquestraArtifact): void {
		if (artifact.features.length === 0) return;

		for (const feature of artifact.features) {
			this.printFeature(feature);
		}
	}

	private printFeature(feature: ArtifactFeature): void {
		console.log(c.bold(`Feature: ${feature.name}`));
		if (feature.domain) console.log(c.dim(`  Domain: ${feature.domain}`));
		console.log(`  As ${this.prefixArticle(feature.as)}`);
		console.log(`  I ${feature.I}`);
		console.log(`  So that ${feature.so}`);
		console.log("");

		for (let i = 0; i < feature.scenarios.length; i++) {
			this.printScenario(feature.scenarios[i]);
			if (i < feature.scenarios.length - 1) console.log("");
		}
		console.log("");
	}

	private printScenario(scenario: ArtifactScenario): void {
		const hasFail = scenario.steps.some((s) => s.status === "failed");
		const allOk = !hasFail && scenario.steps.every((s) => s.status === "success");

		const label = `  Scenario: ${scenario.name}`;
		console.log(allOk ? c.green(label) : hasFail ? c.red(label) : label);

		for (let i = 0; i < scenario.steps.length; i++) {
			this.printStep(scenario.steps[i], i === scenario.steps.length - 1, allOk);
		}
	}

	private printStep(step: ArtifactStep, isLast: boolean, allOk: boolean): void {
		const branch = isLast ? "└──" : "├──";
		const symbol = SYMBOL[step.status] ?? "?";
		const duration = step.durationMs !== undefined ? c.dim(` (${step.durationMs}ms)`) : "";
		const line = `    ${branch} ${symbol} ${step.keyword} ${step.name}${duration}`;

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

	private prefixArticle(as: string): string {
		const trimmed = as.trim();
		if (!trimmed) return trimmed;
		const lower = trimmed.toLowerCase();
		if (/^(an?|the)\s/.test(lower)) return trimmed;
		const startsWithVowel = /^[aeiou]/i.test(trimmed);
		return `${startsWithVowel ? "an" : "a"} ${trimmed}`;
	}
}
