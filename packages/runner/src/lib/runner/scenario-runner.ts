import { TimeoutError, withTimeout } from "@orquestra/core";

export interface ScenarioRunOutcome {
	error: { message: string; stack?: string } | null;
	durationMs: number;
}

/**
 * Replaces the previous `await test(name, fn)` from `node:test`. Runs the
 * scenario body once, swallows the error so the caller can continue with the
 * next scenario, and applies an optional time budget.
 *
 * Resolves the budget with priority: scenario > feature > config default.
 * 0 / undefined / Infinity disables the timeout (delegated to `withTimeout`).
 */
export function resolveScenarioTimeout(
	configDefaultMs: number | undefined,
	featureMs: number | undefined,
	scenarioMs: number | undefined,
): number | undefined {
	return scenarioMs ?? featureMs ?? configDefaultMs;
}

export async function runScenarioBody(
	label: string,
	body: () => Promise<unknown> | unknown,
	timeoutMs: number | undefined,
): Promise<ScenarioRunOutcome> {
	const startedAt = performance.now();
	try {
		await withTimeout(() => Promise.resolve(body()), timeoutMs, label);
		return { error: null, durationMs: Math.round(performance.now() - startedAt) };
	} catch (err: any) {
		const isTimeout = err instanceof TimeoutError;
		return {
			error: {
				// Preserve the TimeoutError prefix so reporters can tell it apart
				// from regular failures without duck-typing on stack lines.
				message: isTimeout ? err.message : String(err?.message ?? err),
				stack: err?.stack,
			},
			durationMs: Math.round(performance.now() - startedAt),
		};
	}
}
