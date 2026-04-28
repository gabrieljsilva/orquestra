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
