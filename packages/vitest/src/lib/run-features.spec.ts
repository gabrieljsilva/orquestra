import { afterEach, vi } from "vitest";
import { _resetConfigured, configure } from "./configure";
import { defineFeature } from "./feature";
import { type VitestHooks, _registerWithHooks } from "./run-features";

function makeHooks() {
	const hooks: VitestHooks = {
		describe: vi.fn(),
		it: vi.fn(),
		beforeAll: vi.fn(),
		afterAll: vi.fn(),
		beforeEach: vi.fn(),
		afterEach: vi.fn(),
	};
	return hooks as VitestHooks & {
		describe: ReturnType<typeof vi.fn>;
		it: ReturnType<typeof vi.fn>;
		beforeAll: ReturnType<typeof vi.fn>;
		afterAll: ReturnType<typeof vi.fn>;
		beforeEach: ReturnType<typeof vi.fn>;
		afterEach: ReturnType<typeof vi.fn>;
	};
}

afterEach(() => {
	try {
		_resetConfigured();
	} catch {}
});

describe("_registerWithHooks", () => {
	it("registers one describe per feature and one it per scenario", () => {
		configure({});
		const calc = defineFeature("Calculator");
		calc.scenario("adds").given("a", () => ({ x: 1 }));
		calc.scenario("subtracts").given("b", () => ({ y: 2 }));
		const sub = defineFeature("Subtractor");
		sub.scenario("subs").given("c", () => ({ z: 3 }));

		const hooks = makeHooks();
		_registerWithHooks(hooks);

		expect(hooks.describe).toHaveBeenCalledTimes(2);
		expect(hooks.describe.mock.calls[0][0]).toBe("Calculator");
		expect(hooks.describe.mock.calls[1][0]).toBe("Subtractor");

		// Expand describe bodies to register the inner its.
		for (const call of hooks.describe.mock.calls) {
			(call[1] as () => void)();
		}

		expect(hooks.it).toHaveBeenCalledTimes(3);
		expect(hooks.it.mock.calls.map((c) => c[0])).toEqual(["adds", "subtracts", "subs"]);
	});

	it("registers an outer beforeAll/afterAll pair for the file-scope lifecycle", () => {
		configure({});
		defineFeature("X")
			.scenario("y")
			.given("z", () => ({}));

		const hooks = makeHooks();
		_registerWithHooks(hooks);

		expect(hooks.beforeAll).toHaveBeenCalled();
		expect(hooks.afterAll).toHaveBeenCalled();
	});

	it("registers per-describe beforeEach/afterEach for scenario-scope hooks", () => {
		configure({});
		defineFeature("X")
			.scenario("y")
			.given("z", () => ({}));

		const hooks = makeHooks();
		_registerWithHooks(hooks);
		for (const call of hooks.describe.mock.calls) {
			(call[1] as () => void)();
		}

		expect(hooks.beforeEach).toHaveBeenCalled();
		expect(hooks.afterEach).toHaveBeenCalled();
	});

	it("the it() callback runs the scenario via BddRunner in given/when/then order", async () => {
		configure({});
		const order: string[] = [];

		defineFeature("F")
			.scenario("ordered")
			.given("g", () => {
				order.push("given");
				return { x: 1 };
			})
			.when("w", ({ x }) => {
				order.push("when");
				return { y: x + 1 };
			})
			.then("t", ({ y }) => {
				order.push("then");
				expect(y).toBe(2);
			});

		const hooks = makeHooks();
		_registerWithHooks(hooks);
		for (const call of hooks.describe.mock.calls) {
			(call[1] as () => void)();
		}

		const itCallback = hooks.it.mock.calls[0][1] as () => Promise<void>;
		await itCallback();

		expect(order).toEqual(["given", "when", "then"]);
	});
});
