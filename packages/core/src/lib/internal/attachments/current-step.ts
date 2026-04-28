import type { StepCollector } from "./step-collector";

export type StepPhase = "step" | "beforeEach" | "afterEach" | "beforeFeature" | "afterFeature";

export interface StepContext {
	collector: StepCollector;
	scenarioId: string;
	stepId: string;
	phase: StepPhase;
}

// Module-level singleton. Safe in V3 because each worker is an isolated
// process and runs one scenario at a time sequentially — there is at most
// one active step in this process at any tick.
let current: StepContext | null = null;

export function setCurrentStepContext(ctx: StepContext | null): void {
	current = ctx;
}

export function getCurrentStepContext(): StepContext | null {
	return current;
}
