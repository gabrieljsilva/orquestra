import { attach, log } from "./api";
import { setCurrentStepContext } from "./current-step";
import { StepCollector } from "./step-collector";

function makeCtx(stepId = "step-1"): StepCollector {
	const collector = new StepCollector();
	setCurrentStepContext({ collector, scenarioId: "sc-1", stepId, phase: "step" });
	return collector;
}

afterEach(() => {
	setCurrentStepContext(null);
});

describe("attach", () => {
	it("forwards to the active collector when called inside a step", () => {
		const collector = makeCtx();
		attach({ name: "answer", type: "text", data: "hi" });

		expect(collector.attachments).toHaveLength(1);
		expect(collector.attachments[0].name).toBe("answer");
	});

	it("supports the json overload", () => {
		const collector = makeCtx();
		attach({ name: "body", type: "json", data: { ok: true } });

		expect(collector.attachments[0].inline).toEqual({ ok: true });
		expect(collector.attachments[0].type).toBe("json");
	});

	it("throws when called outside any step or hook", () => {
		setCurrentStepContext(null);
		expect(() => attach({ name: "x", type: "text", data: "y" })).toThrow(
			/attach\(\) must be called inside a step or hook callback/,
		);
	});

	it("throws with the fire-and-forget hint when the active collector is frozen", () => {
		const collector = makeCtx("late-step");
		collector.freeze();

		expect(() => attach({ name: "x", type: "text", data: "y" })).toThrow(
			/attach\(\) called after step "late-step" finished — likely a fire-and-forget promise\./,
		);
	});

	it("does not mutate the collector when it throws (frozen check happens before the push)", () => {
		const collector = makeCtx();
		collector.freeze();

		expect(() => attach({ name: "x", type: "text", data: "y" })).toThrow();
		expect(collector.attachments).toEqual([]);
	});
});

describe("log", () => {
	it("forwards to the active collector when called inside a step", () => {
		const collector = makeCtx();
		log("model", "gpt-4");

		expect(collector.logs).toHaveLength(1);
		expect(collector.logs[0]).toMatchObject({ label: "model", value: "gpt-4" });
	});

	it("throws when called outside any step", () => {
		setCurrentStepContext(null);
		expect(() => log("x", 1)).toThrow(/log\(\) must be called inside a step or hook callback/);
	});

	it("throws with fire-and-forget hint when the collector is frozen", () => {
		const collector = makeCtx("done-step");
		collector.freeze();

		expect(() => log("x", 1)).toThrow(/log\(\) called after step "done-step" finished/);
	});

	it("accepts arbitrary JSON-like values", () => {
		const collector = makeCtx();
		log("usage", { input: 10, output: 5 });
		log("flag", true);
		log("nullish", null);

		expect(collector.logs.map((l) => l.value)).toEqual([{ input: 10, output: 5 }, true, null]);
	});
});
