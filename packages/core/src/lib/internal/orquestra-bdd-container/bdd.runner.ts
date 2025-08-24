import { createHash } from "node:crypto";
import type { StepEvent } from "../../types/shard-manager/shard-manager.types";

const keywordOf = (k: string): "Given" | "When" | "Then" => {
	if (k === "GIVEN") return "Given";
	if (k === "WHEN") return "When";
	return "Then";
};

export class BddRunner {
	static computeStepId(feature: string, scenario: string, keyword: string, stepName: string): string {
		return createHash("sha1").update(`${feature}\u0001${scenario}\u0001${keyword}\u0001${stepName}`).digest("hex");
	}

	static nowIso(): string {
		return new Date().toISOString();
	}

	static async runScenario(scenario: any, initialCtx: object = {}): Promise<any> {
		let ctx: any = { ...(initialCtx as object) };
		const feature = scenario.feature as any;
		for (const step of (scenario as any).steps as Array<any>) {
			const stepId = BddRunner.computeStepId(feature.getName(), scenario.name, keywordOf(step.kind), step.name);
			const tStart = BddRunner.nowIso();
			try {
				const delta = await step.run(ctx);
				if (delta && typeof delta === "object") {
					ctx = { ...ctx, ...delta };
				} else {
					ctx = { ...ctx, result: delta };
				}
				const evtOk: StepEvent = {
					runId: feature.getRunId(),
					workerPid: process.pid,
					feature: feature.getName(),
					scenario: scenario.name,
					stepId,
					stepName: step.name,
					keyword: keywordOf(step.kind),
					ts: BddRunner.nowIso(),
					tCollect: feature.getCollectTs(stepId),
					tStart,
					tEnd: BddRunner.nowIso(),
					status: "success",
				};
				feature.writeEvent(evtOk);
			} catch (err: any) {
				const evtFail: StepEvent = {
					runId: feature.getRunId(),
					workerPid: process.pid,
					feature: feature.getName(),
					scenario: scenario.name,
					stepId,
					stepName: step.name,
					keyword: keywordOf(step.kind),
					ts: BddRunner.nowIso(),
					tCollect: feature.getCollectTs(stepId),
					tStart,
					tEnd: BddRunner.nowIso(),
					status: "failed",
					error: { message: String(err?.message ?? err), stack: err?.stack },
				};
				feature.writeEvent(evtFail);
				throw err;
			}
		}
		return ctx;
	}

	static async collect(feature: any): Promise<void> {
		for (const scenario of (feature as any).scenarios as Array<any>) {
			for (const step of (scenario as any).steps as Array<any>) {
				const stepId = BddRunner.computeStepId(feature.getName(), scenario.name, keywordOf(step.kind), step.name);
				const tCollect = BddRunner.nowIso();
				(feature as any).collectTimestamps.set(stepId, tCollect);
				const evt: StepEvent = {
					runId: feature.getRunId(),
					workerPid: process.pid,
					feature: feature.getName(),
					scenario: scenario.name,
					stepId,
					stepName: step.name,
					keyword: keywordOf(step.kind),
					ts: tCollect,
					tCollect,
					status: "pending",
				};
				feature.writeEvent(evt);
			}
		}
	}
}
