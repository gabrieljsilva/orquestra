import { ORQUESTRA_RUN_ID_ENV } from "../../constants/shard-manager";
import type { StepEvent } from "../../types/shard-manager/shard-manager.types";
import { OrquestraShardManager } from "../orquestra-shard-manager";

const c = {
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[39m`,
	red: (s: string) => `\x1b[31m${s}\x1b[39m`,
	gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
};

export class OrquestraConsoleReporter {
	static run(): void {
		const runId = process.env[ORQUESTRA_RUN_ID_ENV];
		if (!runId) return;
		const shards = new OrquestraShardManager(runId);
		const events = shards.readEvents();

		const latestByStep = new Map<string, StepEvent>();
		const orderByStep = new Map<string, number>();
		let seq = 0;

		for (const evt of events) {
			latestByStep.set(evt.stepId, evt);
			if (!orderByStep.has(evt.stepId)) orderByStep.set(evt.stepId, ++seq);
		}

		const byFeature = new Map<
			string,
			Map<
				string,
				Array<{
					stepId: string;
					name: string;
					keyword: StepEvent["keyword"];
					status: StepEvent["status"];
					error?: StepEvent["error"];
					order: number;
				}>
			>
		>();

		for (const [stepId, evt] of latestByStep) {
			const featureMap = byFeature.get(evt.feature) ?? new Map();
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
			byFeature.set(evt.feature, featureMap);
		}

		for (const [featureName, scMap] of byFeature) {
			console.log(c.bold(`${featureName}`));
			const scenarios = Array.from(scMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
			for (const [scenarioName, steps] of scenarios) {
				steps.sort((a, b) => a.order - b.order);
				const hasFail = steps.some((s) => s.status === "failed");
				const allOk = !hasFail && steps.every((s) => s.status === "success");
				const scenarioLabel = `\t${scenarioName}`;
				console.log(allOk ? c.green(scenarioLabel) : scenarioLabel);
				for (const step of steps) {
					const line = `\t\t${step.keyword} ${step.name}`;
					if (step.status === "failed") {
						console.log(c.red(line));
						if (step.error?.message) console.log(c.red(`\t\t\t→ ${step.error.message}`));
					} else if (allOk) {
						console.log(c.green(line));
					} else {
						console.log(c.gray(line));
					}
				}
			}
		}
	}
}
