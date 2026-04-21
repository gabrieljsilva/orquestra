import type { FeatureMeta } from "../../types/reporting";
import type { StepEvent } from "../../types/shard-manager/shard-manager.types";
import { OrquestraConsoleReporter } from "./orquestra-console-reporter";

function makeEvent(overrides: Partial<StepEvent>): StepEvent {
	return {
		runId: "run-1",
		workerPid: 1,
		feature: "create user",
		scenario: "it should create a user",
		stepId: "step-1",
		stepName: "I have valid data",
		keyword: "Given",
		ts: "2026-04-21T12:00:00.000Z",
		status: "success",
		...overrides,
	};
}

describe("OrquestraConsoleReporter", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let reporter: OrquestraConsoleReporter;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		reporter = new OrquestraConsoleReporter();
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	function output(): string {
		return logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
	}

	it("retorna sem imprimir quando nao ha eventos", () => {
		reporter.run([], []);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("renderiza feature com narrativa Gherkin usando meta", () => {
		const events = [
			makeEvent({ stepId: "s1", stepName: "I have valid data", keyword: "Given", status: "success" }),
			makeEvent({ stepId: "s2", stepName: "I send a POST", keyword: "When", status: "success" }),
			makeEvent({ stepId: "s3", stepName: "should return 200", keyword: "Then", status: "success" }),
		];
		const meta: FeatureMeta[] = [
			{ feature: "create user", as: "unauthenticated visitor", I: "want to register", so: "I can use the app" },
		];

		reporter.run(events, meta);
		const out = output();

		expect(out).toContain("Feature: create user");
		expect(out).toContain("As an unauthenticated visitor");
		expect(out).toContain("I want to register");
		expect(out).toContain("So that I can use the app");
		expect(out).toContain("Scenario: it should create a user");
		expect(out).toContain("Given I have valid data");
		expect(out).toContain("✓");
	});

	it("nao imprime bloco As/I/So quando nao ha meta para a feature", () => {
		const events = [makeEvent({})];
		reporter.run(events, []);
		const out = output();
		expect(out).toContain("Feature: create user");
		expect(out).not.toContain("As ");
		expect(out).not.toContain("So that ");
	});

	it("usa tree chars ├── e └── na lista de steps", () => {
		const events = [
			makeEvent({ stepId: "s1", stepName: "a", keyword: "Given", status: "success" }),
			makeEvent({ stepId: "s2", stepName: "b", keyword: "When", status: "success" }),
			makeEvent({ stepId: "s3", stepName: "c", keyword: "Then", status: "success" }),
		];
		reporter.run(events, []);
		const out = output();
		expect(out).toContain("├──");
		expect(out).toContain("└──");
		const lastStepLine = out.split("\n").find((l) => l.includes("Then c"));
		expect(lastStepLine).toContain("└──");
	});

	it("imprime step falho com simbolo ✗ e mensagem de erro", () => {
		const events = [
			makeEvent({
				stepId: "s1",
				stepName: "failing step",
				keyword: "When",
				status: "failed",
				error: { message: "boom" },
			}),
		];
		reporter.run(events, []);
		const out = output();
		expect(out).toContain("✗");
		expect(out).toContain("When failing step");
		expect(out).toContain("→ boom");
	});

	it("imprime step pending com simbolo ○", () => {
		const events = [makeEvent({ stepId: "s1", stepName: "not yet", status: "pending" })];
		reporter.run(events, []);
		expect(output()).toContain("○");
	});

	it("usa ? como fallback quando o status e desconhecido", () => {
		const events = [
			makeEvent({
				stepId: "s1",
				stepName: "weird",
				status: "skipped" as any,
			}),
		];
		reporter.run(events, []);
		expect(output()).toContain("?");
	});

	it("mantem a ordem de insercao das features independentemente do nome", () => {
		const events = [
			makeEvent({ stepId: "s1", feature: "zeta", scenario: "sc1", stepName: "a" }),
			makeEvent({ stepId: "s2", feature: "alpha", scenario: "sc1", stepName: "b" }),
		];
		reporter.run(events, []);
		const out = output();
		expect(out.indexOf("Feature: zeta")).toBeLessThan(out.indexOf("Feature: alpha"));
	});

	it("considera o evento mais recente do mesmo stepId (ex.: pending -> success)", () => {
		const events = [
			makeEvent({ stepId: "s1", stepName: "x", status: "pending" }),
			makeEvent({ stepId: "s1", stepName: "x", status: "success" }),
		];
		reporter.run(events, []);
		const out = output();
		expect(out).toContain("✓");
		expect(out).not.toContain("○");
	});

	it("nao adiciona artigo quando o 'as' ja comeca com an/a/the", () => {
		const events = [makeEvent({})];
		const meta: FeatureMeta[] = [{ feature: "create user", as: "an admin", I: "want x", so: "I get y" }];
		reporter.run(events, meta);
		expect(output()).toContain("As an admin");
	});
});
