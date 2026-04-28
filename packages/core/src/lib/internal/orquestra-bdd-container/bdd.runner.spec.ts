import { attach, getCurrentStepContext, log } from "../attachments";
import type { StepEvent } from "../../types/events";
import { BddRunner } from "./bdd.runner";

interface FakeStep {
	kind: "GIVEN" | "WHEN" | "THEN";
	name: string;
	fn?: (ctx: any) => any;
	run?: (ctx: any) => any;
}

function makeStep(part: FakeStep): FakeStep {
	return {
		...part,
		run: part.fn ? (ctx) => part.fn!(ctx) : undefined,
	};
}

function makeScenario(name: string, steps: FakeStep[], featureName = "feat") {
	const events: StepEvent[] = [];
	const feature = {
		getName: () => featureName,
		pushEvent: (e: StepEvent) => {
			events.push(e);
		},
	};
	const scenario = { name, feature, steps };
	return { scenario, events, feature };
}

describe("BddRunner.runScenario", () => {
	it("preserves previous ctx when a step returns undefined (A1)", async () => {
		const { scenario } = makeScenario("s", [
			makeStep({ kind: "WHEN", name: "compute", fn: () => ({ result: 42 }) }),
			makeStep({ kind: "THEN", name: "assert", fn: () => undefined }),
		]);
		const ctx = await BddRunner.runScenario(scenario);
		expect(ctx).toEqual({ result: 42 });
	});

	it("merges object deltas into ctx", async () => {
		const { scenario } = makeScenario("s", [
			makeStep({ kind: "GIVEN", name: "user", fn: () => ({ user: { id: 1 } }) }),
			makeStep({ kind: "WHEN", name: "token", fn: () => ({ token: "abc" }) }),
		]);
		const ctx = await BddRunner.runScenario(scenario);
		expect(ctx).toEqual({ user: { id: 1 }, token: "abc" });
	});

	it("treats null returns as a `result` delta (not as void)", async () => {
		const { scenario } = makeScenario("s", [makeStep({ kind: "WHEN", name: "fetch", fn: () => null })]);
		const ctx = await BddRunner.runScenario(scenario);
		expect(ctx).toEqual({ result: null });
	});

	it("primitive returns become ctx.result", async () => {
		const { scenario } = makeScenario("s", [makeStep({ kind: "WHEN", name: "compute", fn: () => 7 })]);
		const ctx = await BddRunner.runScenario(scenario);
		expect(ctx).toEqual({ result: 7 });
	});

	it("emits pending event with helpful error message when step has no fn (A5)", async () => {
		const { scenario, events } = makeScenario("s", [{ kind: "GIVEN", name: "user is logged in" }]);
		await BddRunner.runScenario(scenario);
		expect(events).toHaveLength(1);
		expect(events[0].status).toBe("pending");
		expect(events[0].error).toBeDefined();
		expect(events[0].error?.message).toContain('Step "user is logged in" has no implementation');
		expect(events[0].error?.message).toContain('.given("user is logged in"');
		expect(events[0].error?.message).toContain("macro");
	});

	it("emits failed event and rethrows when a step fn throws", async () => {
		const { scenario, events } = makeScenario("s", [
			makeStep({
				kind: "WHEN",
				name: "boom",
				fn: () => {
					throw new Error("kaboom");
				},
			}),
		]);
		await expect(BddRunner.runScenario(scenario)).rejects.toThrow("kaboom");
		expect(events).toHaveLength(1);
		expect(events[0].status).toBe("failed");
		expect(events[0].error?.message).toBe("kaboom");
	});

	it("a void `then` after a `when` does not wipe earlier ctx fields", async () => {
		const sink: any[] = [];
		const { scenario } = makeScenario("s", [
			makeStep({ kind: "GIVEN", name: "seed", fn: () => ({ count: 0 }) }),
			makeStep({ kind: "WHEN", name: "increment", fn: (ctx) => ({ count: ctx.count + 1 }) }),
			makeStep({
				kind: "THEN",
				name: "log",
				fn: (ctx) => {
					sink.push(ctx.count);
				},
			}),
		]);
		const ctx = await BddRunner.runScenario(scenario);
		expect(sink).toEqual([1]);
		expect(ctx).toEqual({ count: 1 });
	});

	describe("attachments & logs", () => {
		it("collects attachments emitted during a step into the StepEvent", async () => {
			const { scenario, events } = makeScenario("s", [
				makeStep({
					kind: "WHEN",
					name: "ai call",
					fn: () => {
						attach({ name: "AI response", type: "markdown", data: "# answer" });
						attach({ name: "Tool calls", type: "json", data: [{ name: "search" }] });
					},
				}),
			]);
			await BddRunner.runScenario(scenario);

			expect(events[0].attachments).toBeDefined();
			expect(events[0].attachments).toHaveLength(2);
			expect(events[0].attachments?.[0]).toMatchObject({ name: "AI response", type: "markdown" });
			expect(events[0].attachments?.[1]).toMatchObject({ name: "Tool calls", type: "json" });
		});

		it("collects logs emitted during a step into the StepEvent", async () => {
			const { scenario, events } = makeScenario("s", [
				makeStep({
					kind: "WHEN",
					name: "ai call",
					fn: () => {
						log("model", "gpt-4");
						log("latency_ms", 123);
					},
				}),
			]);
			await BddRunner.runScenario(scenario);

			expect(events[0].logs).toHaveLength(2);
			expect(events[0].logs?.[0]).toMatchObject({ label: "model", value: "gpt-4" });
			expect(events[0].logs?.[1]).toMatchObject({ label: "latency_ms", value: 123 });
		});

		it("does not set attachments/logs fields when the step emits nothing", async () => {
			const { scenario, events } = makeScenario("s", [
				makeStep({ kind: "GIVEN", name: "noop", fn: () => ({ x: 1 }) }),
			]);
			await BddRunner.runScenario(scenario);

			expect(events[0].attachments).toBeUndefined();
			expect(events[0].logs).toBeUndefined();
		});

		it("clears the current step context after each step (sequential isolation)", async () => {
			const seenAfter: Array<unknown> = [];
			const { scenario } = makeScenario("s", [
				makeStep({
					kind: "WHEN",
					name: "a",
					fn: () => {
						attach({ name: "a", type: "text", data: "1" });
					},
				}),
				makeStep({
					kind: "THEN",
					name: "b",
					fn: () => {
						// Each step should see only its own collector — never a leftover.
						const ctx = getCurrentStepContext();
						seenAfter.push(ctx?.stepId);
						attach({ name: "b", type: "text", data: "2" });
					},
				}),
			]);
			await BddRunner.runScenario(scenario);

			expect(getCurrentStepContext()).toBeNull();
			expect(seenAfter).toHaveLength(1);
			expect(seenAfter[0]).toBeTruthy();
		});

		it("freezes the collector and clears the singleton even when the step throws", async () => {
			const { scenario } = makeScenario("s", [
				makeStep({
					kind: "WHEN",
					name: "boom",
					fn: () => {
						attach({ name: "before crash", type: "text", data: "ctx" });
						throw new Error("kaboom");
					},
				}),
			]);

			await expect(BddRunner.runScenario(scenario)).rejects.toThrow("kaboom");

			// After a thrown step, calls outside any step must throw — proves the
			// singleton was cleared even on the error path.
			expect(getCurrentStepContext()).toBeNull();
			expect(() => attach({ name: "leaked", type: "text", data: "x" })).toThrow(
				/must be called inside a step or hook callback/,
			);
		});

		it("includes attachments/logs collected before a step throws on the failed event", async () => {
			const { scenario, events } = makeScenario("s", [
				makeStep({
					kind: "WHEN",
					name: "partial",
					fn: () => {
						attach({ name: "diagnostic", type: "json", data: { stage: "pre-error" } });
						log("stage", "pre-error");
						throw new Error("nope");
					},
				}),
			]);

			await expect(BddRunner.runScenario(scenario)).rejects.toThrow("nope");

			expect(events[0].status).toBe("failed");
			expect(events[0].attachments).toHaveLength(1);
			expect(events[0].logs).toHaveLength(1);
		});

		it("propagates a fire-and-forget pattern as an explicit error when it lands between steps", async () => {
			let resolveFromOutside!: () => void;
			const escape = new Promise<void>((r) => {
				resolveFromOutside = r;
			});

			const { scenario } = makeScenario("s", [
				makeStep({
					kind: "WHEN",
					name: "fire-and-forget",
					fn: () => {
						// Caller "forgets" to await this branch. It will only resolve
						// after the step has returned — by then the collector is frozen.
						void escape.then(() => {
							attach({ name: "leaked", type: "text", data: "x" });
						});
					},
				}),
			]);

			await BddRunner.runScenario(scenario);

			// Now release the leaked promise. The attach() call should throw — and the
			// throw lands on the unhandled rejection. We catch it here for the assert.
			const captured: Error[] = [];
			process.once("unhandledRejection", (err: Error) => {
				captured.push(err);
			});
			resolveFromOutside();
			// Yield a microtask so the .then callback runs.
			await new Promise((r) => setImmediate(r));

			expect(captured.length).toBeGreaterThan(0);
			expect(captured[0].message).toMatch(/must be called inside a step or hook callback/);
		});
	});
});
