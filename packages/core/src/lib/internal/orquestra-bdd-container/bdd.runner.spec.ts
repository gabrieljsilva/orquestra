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
		const log: any[] = [];
		const { scenario } = makeScenario("s", [
			makeStep({ kind: "GIVEN", name: "seed", fn: () => ({ count: 0 }) }),
			makeStep({ kind: "WHEN", name: "increment", fn: (ctx) => ({ count: ctx.count + 1 }) }),
			makeStep({
				kind: "THEN",
				name: "log",
				fn: (ctx) => {
					log.push(ctx.count);
				},
			}),
		]);
		const ctx = await BddRunner.runScenario(scenario);
		expect(log).toEqual([1]);
		expect(ctx).toEqual({ count: 1 });
	});
});
