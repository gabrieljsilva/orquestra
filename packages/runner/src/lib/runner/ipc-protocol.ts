import type { FeatureMeta, FeatureTimings, HookEvent, StepEvent } from "@orquestra/core";

export type MainToWorkerMessage = { type: "feature:assign"; file: string } | { type: "shutdown" };

export type WorkerToMainMessage =
	| { type: "ready" }
	| { type: "step:event"; event: StepEvent }
	| { type: "hook:event"; event: HookEvent }
	| { type: "feature:meta"; meta: FeatureMeta; file: string }
	| { type: "feature:done"; file: string; timings: FeatureTimings; heapUsedBytes?: number }
	| {
			type: "feature:failed";
			file: string;
			error: { message: string; stack?: string };
			timings?: FeatureTimings;
			heapUsedBytes?: number;
	  }
	| { type: "worker:done" };

export interface WorkerSpawnOptions {
	configPath: string;
	workerId: number;
}
