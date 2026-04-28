import { BddContainer, Feature, Step, StepKind } from "./bdd.container";

describe("BddContainer / Feature shadow warnings (M9)", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("warns when an inline step shadows a registered macro with the same title", () => {
		const container = new BddContainer();
		// Macro factory pretends a macro named "user logs in" exists.
		container.setMacroStepFactory((kind, title) => {
			if (kind === StepKind.GIVEN && title === "user logs in") {
				return new Step(StepKind.GIVEN, title, async () => ({ macro: true }));
			}
			return undefined;
		});

		const feature = container.define("login", {
			as: "user",
			I: "log in",
			so: "I get access",
		} as any);
		feature.scenario("ok").given("user logs in", () => ({ inline: true }));

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringMatching(/Step "GIVEN user logs in" .* shadows a macro/),
		);
	});

	it("does NOT warn for inline steps whose title doesn't match any macro", () => {
		const container = new BddContainer();
		container.setMacroStepFactory(() => undefined);

		const feature = container.define("plain", {
			as: "user",
			I: "do",
			so: "result",
		} as any);
		feature.scenario("ok").given("seed data", () => ({ ok: true }));

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("does NOT warn when calling a macro by title (no inline fn)", () => {
		const container = new BddContainer();
		container.setMacroStepFactory((kind, title) =>
			kind === StepKind.GIVEN && title === "user logs in"
				? new Step(StepKind.GIVEN, title, async () => ({ macro: true }))
				: undefined,
		);

		const feature = container.define("login", {
			as: "user",
			I: "log in",
			so: "I get access",
		} as any);
		feature.scenario("ok").given("user logs in");

		expect(warnSpy).not.toHaveBeenCalled();
	});
});

describe("Feature.withRegistry / scenario registration", () => {
	it("scenarios registered in the same feature share the step registry", () => {
		const container = new BddContainer();
		const feature = container.define("shared", { as: "u", I: "i", so: "s" } as any);

		const sideEffect: string[] = [];
		feature
			.scenario("a")
			.given("seed", () => {
				sideEffect.push("seed");
				return { ok: true };
			});

		// The second scenario references the same step by name — registry hit.
		feature.scenario("b").given("seed");
		const features = (container as unknown as { features: Feature[] }).features;
		expect(features).toHaveLength(1);
	});
});

describe("Feature.timeoutMs / Scenario.timeoutMs (V3 timeout overrides)", () => {
	it("Feature.timeoutMs is undefined when not declared (caller falls back to config default)", () => {
		const container = new BddContainer();
		const feature = container.define("plain", { as: "u", I: "i", so: "s" } as any);
		expect(feature.timeoutMs).toBeUndefined();
	});

	it("Feature.timeoutMs reflects the value passed in the FeatureDefinition", () => {
		const container = new BddContainer();
		const feature = container.define("slow", {
			as: "u",
			I: "i",
			so: "s",
			timeoutMs: 30_000,
		} as any);
		expect(feature.timeoutMs).toBe(30_000);
	});

	it("Scenario without options carries no timeoutMs override", () => {
		const container = new BddContainer();
		const feature = container.define("no-override", { as: "u", I: "i", so: "s" } as any);
		const scenario = feature.scenario("normal");
		expect(scenario.timeoutMs).toBeUndefined();
	});

	it("Scenario(name, { timeoutMs }) records the per-scenario override", () => {
		const container = new BddContainer();
		const feature = container.define("with-override", { as: "u", I: "i", so: "s" } as any);
		const scenario = feature.scenario("regression: heavy report", { timeoutMs: 60_000 });
		expect(scenario.timeoutMs).toBe(60_000);
	});

	it("Per-scenario timeoutMs is independent from the feature-level value", () => {
		const container = new BddContainer();
		const feature = container.define("mixed", {
			as: "u",
			I: "i",
			so: "s",
			timeoutMs: 10_000,
		} as any);
		const fast = feature.scenario("fast");
		const slow = feature.scenario("slow", { timeoutMs: 90_000 });

		expect(fast.timeoutMs).toBeUndefined(); // caller resolves it from feature
		expect(slow.timeoutMs).toBe(90_000);
		expect(feature.timeoutMs).toBe(10_000);
	});
});
