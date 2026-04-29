import { afterEach } from "vitest";
import { _resetConfigured, configure } from "./configure";
import { defineFeature } from "./feature";

afterEach(() => {
	try {
		_resetConfigured();
	} catch {}
});

describe("defineFeature", () => {
	it("creates a feature without persona narrative (unit-test style)", () => {
		configure({});
		const f = defineFeature("Calculator");

		expect(f.getName()).toBe("Calculator");
		expect(f.hasPersonaNarrative()).toBe(false);
		expect(f.getAs()).toBe("");
		expect(f.getI()).toBe("");
		expect(f.getSo()).toBe("");
	});

	it("preserves persona narrative when explicitly provided (E2E style)", () => {
		configure({});
		const f = defineFeature("login", {
			as: "registered user",
			I: "want to log in",
			so: "I can access protected pages",
		});

		expect(f.hasPersonaNarrative()).toBe(true);
		expect(f.getAs()).toBe("registered user");
		expect(f.getI()).toBe("want to log in");
		expect(f.getSo()).toBe("I can access protected pages");
	});

	it("attaches scenarios via the same chained DSL as @orquestra/core", () => {
		configure({});
		const f = defineFeature("Calculator");
		f.scenario("adds two numbers").given("a calc", () => ({ x: 1 }));

		expect(f.getScenarios()).toHaveLength(1);
		expect(f.getScenarios()[0].name).toBe("adds two numbers");
	});

	it("supports the const-capture-and-reuse pattern (no name shadowing with the import)", () => {
		configure({});
		const calc = defineFeature("Calculator");
		calc.scenario("adds").given("a", () => ({ x: 1 }));
		calc.scenario("subtracts").given("b", () => ({ y: 2 }));

		expect(calc.getScenarios()).toHaveLength(2);
		expect(calc.getScenarios().map((s) => s.name)).toEqual(["adds", "subtracts"]);
	});

	it("auto-initializes when called without an explicit configure() (zero-config unit tests)", () => {
		const f = defineFeature("ZeroConfig");
		expect(f.getName()).toBe("ZeroConfig");
		// Subsequent defineFeature() calls in the same file see the same auto-init instance.
		const g = defineFeature("Another");
		expect(g.getName()).toBe("Another");
	});

	it("rejects configure() called AFTER a defineFeature() that auto-initialized", () => {
		defineFeature("EarlyBird");
		expect(() => configure({})).toThrow(/configure\(\) must be called BEFORE any feature\(\) declaration/);
	});
});
