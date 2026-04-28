import { createHash } from "node:crypto";
import type { StepEvent } from "../../types/events";
import { StepCollector, setCurrentStepContext } from "../attachments";

const keywordOf = (k: string): "Given" | "When" | "Then" => {
	if (k === "GIVEN") return "Given";
	if (k === "WHEN") return "When";
	return "Then";
};

function scenarioIdOf(featureName: string, scenarioName: string): string {
	return createHash("sha1").update(`${featureName}${scenarioName}`).digest("hex");
}

export class BddRunner {
	static computeStepId(feature: string, scenario: string, keyword: string, stepName: string): string {
		return createHash("sha1").update(`${feature}\u0001${scenario}\u0001${keyword}\u0001${stepName}`).digest("hex");
	}

	static async runScenario(scenario: any, initialCtx: object = {}): Promise<any> {
		let ctx: any = { ...(initialCtx as object) };
		const feature = scenario.feature as any;
		const scenarioId = scenarioIdOf(feature.getName(), scenario.name);

		for (const step of (scenario as any).steps as Array<any>) {
			const keyword = keywordOf(step.kind);
			const stepId = BddRunner.computeStepId(feature.getName(), scenario.name, keyword, step.name);

			if (!step.fn) {
				const evt: StepEvent = {
					feature: feature.getName(),
					scenario: scenario.name,
					stepId,
					stepName: step.name,
					keyword,
					status: "pending",
					error: {
						message:
							`Step "${step.name}" has no implementation. ` +
							`Either provide a function (e.g. .${keyword.toLowerCase()}("${step.name}", (ctx) => { ... })) ` +
							`or check that the title matches an existing macro.`,
					},
				};
				feature.pushEvent(evt);
				continue;
			}

			const collector = new StepCollector();
			setCurrentStepContext({ collector, scenarioId, stepId, phase: "step" });
			const startTime = performance.now();
			try {
				const delta = await step.run(ctx);
				if (delta === undefined) {
					// Step returned void — keep previous ctx as-is. Without this
					// guard, `then` steps (which usually return void) would wipe
					// `ctx.result` set by a prior `when`.
				} else if (delta !== null && typeof delta === "object") {
					ctx = { ...ctx, ...delta };
				} else {
					ctx = { ...ctx, result: delta };
				}
				const durationMs = Math.round(performance.now() - startTime);
				const evt: StepEvent = {
					feature: feature.getName(),
					scenario: scenario.name,
					stepId,
					stepName: step.name,
					keyword,
					status: "success",
					durationMs,
				};
				if (collector.attachments.length > 0) evt.attachments = [...collector.attachments];
				if (collector.logs.length > 0) evt.logs = [...collector.logs];
				feature.pushEvent(evt);
			} catch (err: any) {
				const durationMs = Math.round(performance.now() - startTime);
				const evt: StepEvent = {
					feature: feature.getName(),
					scenario: scenario.name,
					stepId,
					stepName: step.name,
					keyword,
					status: "failed",
					durationMs,
					error: { message: String(err?.message ?? err), stack: err?.stack },
				};
				if (collector.attachments.length > 0) evt.attachments = [...collector.attachments];
				if (collector.logs.length > 0) evt.logs = [...collector.logs];
				feature.pushEvent(evt);
				throw err;
			} finally {
				collector.freeze();
				setCurrentStepContext(null);
			}
		}
		return ctx;
	}
}
