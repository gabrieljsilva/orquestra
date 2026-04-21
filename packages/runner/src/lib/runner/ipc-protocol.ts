import type { FeatureMeta, StepEvent } from "@orquestra/core";

export type MainToWorkerMessage =
	| { type: "feature:assign"; file: string }
	| { type: "shutdown" };

export type WorkerToMainMessage =
	| { type: "ready" }
	| { type: "step:event"; event: StepEvent }
	| { type: "feature:meta"; meta: FeatureMeta }
	| { type: "feature:done"; file: string }
	| { type: "feature:failed"; file: string; error: { message: string; stack?: string } }
	| { type: "worker:done" };

export interface WorkerSpawnOptions {
	configPath: string;
	workerId: number;
}
