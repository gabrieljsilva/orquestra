import type { OrquestraArtifact } from "../../types/artifact";
import { OrquestraConsoleReporter } from "./orquestra-console-reporter";

function makeArtifact(overrides: Partial<OrquestraArtifact> = {}): OrquestraArtifact {
	return {
		orquestraVersion: "1.0.0",
		generatedAt: "2026-04-21T00:00:00Z",
		status: "success",
		glossary: {},
		personas: [],
		domains: [],
		features: [],
		summary: { totalFeatures: 0, totalScenarios: 0, passed: 0, failed: 0, pending: 0 },
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

	it("nao imprime nada quando nao ha features", () => {
		reporter.run(makeArtifact());
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("renderiza feature com narrativa Gherkin", () => {
		reporter.run(
			makeArtifact({
				features: [
					{
						name: "create user",
						domain: null,
						context: null,
						as: "unauthenticated visitor",
						I: "want to register",
						so: "I can use the app",
						status: "success",
						scenarios: [
							{
								name: "it should create a user",
								status: "success",
								steps: [
									{ keyword: "Given", name: "I have valid data", status: "success" },
									{ keyword: "When", name: "I send a POST", status: "success" },
									{ keyword: "Then", name: "should return 200", status: "success" },
								],
							},
						],
					},
				],
			}),
		);

		const out = output();
		expect(out).toContain("Feature: create user");
		expect(out).toContain("As an unauthenticated visitor");
		expect(out).toContain("I want to register");
		expect(out).toContain("So that I can use the app");
		expect(out).toContain("Scenario: it should create a user");
		expect(out).toContain("Given I have valid data");
		expect(out).toContain("✓");
	});

	it("imprime domain quando presente", () => {
		reporter.run(
			makeArtifact({
				features: [
					{
						name: "create user",
						domain: "user management",
						context: null,
						as: "visitor",
						I: "want something",
						so: "I get it",
						status: "success",
						scenarios: [],
					},
				],
			}),
		);
		expect(output()).toContain("Domain: user management");
	});

	it("imprime step falho com simbolo ✗ e mensagem", () => {
		reporter.run(
			makeArtifact({
				features: [
					{
						name: "billing",
						domain: null,
						context: null,
						as: "customer",
						I: "want checkout",
						so: "I can pay",
						status: "failed",
						scenarios: [
							{
								name: "failing scenario",
								status: "failed",
								steps: [
									{
										keyword: "When",
										name: "a step throws",
										status: "failed",
										error: { message: "boom" },
									},
								],
							},
						],
					},
				],
			}),
		);
		const out = output();
		expect(out).toContain("✗");
		expect(out).toContain("When a step throws");
		expect(out).toContain("→ boom");
	});

	it("imprime step pending com simbolo ○", () => {
		reporter.run(
			makeArtifact({
				features: [
					{
						name: "future",
						domain: null,
						context: null,
						as: "dev",
						I: "want to specify later",
						so: "I can plan",
						status: "pending",
						scenarios: [
							{
								name: "pending scenario",
								status: "pending",
								steps: [{ keyword: "Given", name: "not yet", status: "pending" }],
							},
						],
					},
				],
			}),
		);
		expect(output()).toContain("○");
	});

	it("nao adiciona artigo quando 'as' ja comeca com an/a/the", () => {
		reporter.run(
			makeArtifact({
				features: [
					{
						name: "x",
						domain: null,
						context: null,
						as: "an admin",
						I: "want y",
						so: "I get z",
						status: "success",
						scenarios: [],
					},
				],
			}),
		);
		expect(output()).toContain("As an admin");
	});

	it("mostra duracao do step quando presente", () => {
		reporter.run(
			makeArtifact({
				features: [
					{
						name: "x",
						domain: null,
						context: null,
						as: "user",
						I: "want y",
						so: "I get z",
						status: "success",
						scenarios: [
							{
								name: "s",
								status: "success",
								steps: [{ keyword: "Given", name: "setup", status: "success", durationMs: 42 }],
							},
						],
					},
				],
			}),
		);
		expect(output()).toContain("(42ms)");
	});
});
