import type { AttachmentInput } from "../../types/attachments";
import { getCurrentStepContext } from "./current-step";

const OUTSIDE_STEP_MESSAGE = "must be called inside a step or hook callback";
const FROZEN_HINT = "Always await async work inside the step/hook.";

export function attach(input: AttachmentInput): void {
	const ctx = getCurrentStepContext();
	if (!ctx) {
		throw new Error(`attach() ${OUTSIDE_STEP_MESSAGE}`);
	}
	if (ctx.collector.frozen) {
		throw new Error(
			`attach() called after step "${ctx.stepId}" finished — likely a fire-and-forget promise. ${FROZEN_HINT}`,
		);
	}
	ctx.collector.attach(input);
}

export function log(label: string, value: unknown): void {
	const ctx = getCurrentStepContext();
	if (!ctx) {
		throw new Error(`log() ${OUTSIDE_STEP_MESSAGE}`);
	}
	if (ctx.collector.frozen) {
		throw new Error(
			`log() called after step "${ctx.stepId}" finished — likely a fire-and-forget promise. ${FROZEN_HINT}`,
		);
	}
	ctx.collector.log(label, value);
}
