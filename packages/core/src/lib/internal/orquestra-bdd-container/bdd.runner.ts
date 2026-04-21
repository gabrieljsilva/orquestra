import { createHash } from "node:crypto";
import type { StepEvent } from "../../types/events";

const keywordOf = (k: string): "Given" | "When" | "Then" => {
	if (k === "GIVEN") return "Given";
	if (k === "WHEN") return "When";
	return "Then";
};

export class BddRunner {
	static computeStepId(feature: string, scenario: string, keyword: string, stepName: string): string {
		return createHash("sha1").update(`${feature}\u0001${scenario}\u0001${keyword}\u0001${stepName}`).digest("hex");
	}

	static async runScenario(scenario: any, initialCtx: object = {}): Promise<any> {
		let ctx: any = { ...(initialCtx as object) };
		const feature = scenario.feature as any;

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
				};
				feature.pushEvent(evt);
				continue;
			}

			const startTime = performance.now();
			try {
				const delta = await step.run(ctx);
				if (delta && typeof delta === "object") {
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
				feature.pushEvent(evt);
				throw err;
			}
		}
		return ctx;
	}
}
