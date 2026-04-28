import { TimeoutError } from "@orquestra/core";
import { resolveScenarioTimeout, runScenarioBody } from "./scenario-runner";

describe("resolveScenarioTimeout", () => {
	it("scenario timeout overrides feature and config defaults", () => {
		expect(resolveScenarioTimeout(5000, 30000, 1000)).toBe(1000);
	});

	it("falls back to feature timeout when scenario doesn't override", () => {
		expect(resolveScenarioTimeout(5000, 30000, undefined)).toBe(30000);
	});

	it("falls back to config default when neither feature nor scenario override", () => {
		expect(resolveScenarioTimeout(5000, undefined, undefined)).toBe(5000);
	});

	it("returns undefined when nothing is configured (caller decides)", () => {
		expect(resolveScenarioTimeout(undefined, undefined, undefined)).toBeUndefined();
	});

	it("treats 0 as a valid (disabling) override at every level — withTimeout interprets it", () => {
		expect(resolveScenarioTimeout(5000, 0, undefined)).toBe(0);
		expect(resolveScenarioTimeout(5000, 30000, 0)).toBe(0);
	});
});

describe("runScenarioBody", () => {
	it("resolves with error null when the body succeeds", async () => {
		const outcome = await runScenarioBody("ok", async () => {}, 1000);
		expect(outcome.error).toBeNull();
		expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("captures synchronous throws without rethrowing — caller's loop must continue", async () => {
		const outcome = await runScenarioBody(
			"sync throw",
			() => {
				throw new Error("boom");
			},
			1000,
		);
		expect(outcome.error).not.toBeNull();
		expect(outcome.error?.message).toBe("boom");
		expect(outcome.error?.stack).toBeDefined();
	});

	it("captures async rejections", async () => {
		const outcome = await runScenarioBody("async reject", async () => {
			throw new Error("async-failure");
		}, 1000);
		expect(outcome.error?.message).toBe("async-failure");
	});

	it("translates a hung body into a TimeoutError carrying the scenario knob hint", async () => {
		const outcome = await runScenarioBody(
			"stuck",
			() =>
				new Promise(() => {
					/* never resolves */
				}),
			15,
		);
		expect(outcome.error).not.toBeNull();
		// Message must include the user-actionable knob — that's the contract
		// we promised in the documentation, regression here = silent UX rot.
		expect(outcome.error?.message).toContain("scenarioTimeoutMs");
		expect(outcome.error?.message).toContain("stuck");
	});

	it("disabled timeout (0/undefined) lets the body run unbounded", async () => {
		const outcome = await runScenarioBody("free", async () => {
			await new Promise((r) => setTimeout(r, 5));
		}, 0);
		expect(outcome.error).toBeNull();
	});

	it("captures non-Error throws as best-effort message strings", async () => {
		const outcome = await runScenarioBody(
			"weird",
			() => {
				throw "string thrown";
			},
			1000,
		);
		expect(outcome.error?.message).toBe("string thrown");
	});

	it("preserves the original error type info when it's a TimeoutError", async () => {
		// Sanity: a TimeoutError originating inside the body (not from our
		// wrapper) still flows through unchanged.
		const outcome = await runScenarioBody(
			"inner-timeout",
			() => {
				throw new TimeoutError("custom", 99);
			},
			1000,
		);
		expect(outcome.error?.message).toContain("custom");
		expect(outcome.error?.message).toContain("99ms");
	});
});
