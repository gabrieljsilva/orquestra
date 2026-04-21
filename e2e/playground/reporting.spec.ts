import {
	Orquestra,
	OrquestraConsoleReporter,
	type OrquestraArtifact,
	OrquestraReporter,
	type StepEvent,
} from "@orquestra/core";

function buildMinimalArtifact(orquestra: Orquestra): OrquestraArtifact {
	const events = orquestra.getEvents();
	const meta = orquestra.getFeatureMeta();

	const featureMap = new Map<string, { scenarios: Map<string, StepEvent[]> }>();
	for (const evt of events) {
		const feat = featureMap.get(evt.feature) ?? { scenarios: new Map() };
		const scenario = feat.scenarios.get(evt.scenario) ?? [];
		scenario.push(evt);
		feat.scenarios.set(evt.scenario, scenario);
		featureMap.set(evt.feature, feat);
	}

	const features = meta.map((m) => {
		const f = featureMap.get(m.feature);
		const scenarios = f
			? Array.from(f.scenarios.entries()).map(([name, evts]) => ({
					name,
					status: (evts.some((e) => e.status === "failed")
						? "failed"
						: evts.every((e) => e.status === "success")
							? "success"
							: "pending") as "success" | "failed" | "pending",
					steps: evts.map((e) => ({
						keyword: e.keyword,
						name: e.stepName,
						status: e.status,
						durationMs: e.durationMs,
						error: e.error,
					})),
				}))
			: [];

		return {
			name: m.feature,
			domain: m.domain ?? null,
			context: m.context ?? null,
			as: m.as,
			I: m.I,
			so: m.so,
			status: scenarios.some((s) => s.status === "failed")
				? ("failed" as const)
				: scenarios.every((s) => s.status === "success")
					? ("success" as const)
					: ("pending" as const),
			scenarios,
		};
	});

	return {
		orquestraVersion: "1.0.0",
		generatedAt: new Date().toISOString(),
		status: "success",
		glossary: {},
		personas: [],
		domains: [],
		features,
		summary: {
			totalFeatures: features.length,
			totalScenarios: features.reduce((n, f) => n + f.scenarios.length, 0),
			passed: 0,
			failed: 0,
			pending: 0,
		},
	};
}

describe("reporting", () => {
	describe("eventos em memoria", () => {
		const orquestra = new Orquestra({});

		beforeAll(async () => {
			await orquestra.start();
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		it("acumula step events em memoria apos feature.test()", async () => {
			const feature = orquestra.feature("manage account", {
				as: "authenticated user",
				I: "want to update my profile",
				so: "my data stays accurate",
			});

			feature
				.scenario("it updates the display name")
				.given("I am logged in", () => ({ userId: 1 }))
				.when("I PATCH /me with a new name", ({ userId }) => ({ response: { status: 200, userId } }))
				.then("returns 200", async ({ response }) => {
					expect(response.status).toBe(200);
				});

			await feature.test();

			const events = orquestra.getEvents();
			const featureEvents = events.filter((e) => e.feature === "manage account");

			expect(featureEvents.length).toBeGreaterThan(0);
			expect(featureEvents.every((e) => e.status === "success")).toBe(true);
			expect(featureEvents.every((e) => typeof e.durationMs === "number")).toBe(true);
		});

		it("expoe feature meta com as/I/so via getFeatureMeta()", async () => {
			const meta = orquestra.getFeatureMeta();
			const found = meta.find((m) => m.feature === "manage account");

			expect(found).toBeDefined();
			expect(found?.as).toBe("authenticated user");
			expect(found?.I).toBe("want to update my profile");
			expect(found?.so).toBe("my data stays accurate");
		});
	});

	describe("context e domain na feature meta", () => {
		const orquestra = new Orquestra({});

		beforeAll(async () => {
			await orquestra.start();
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		it("inclui context e domain na meta quando definidos", async () => {
			const feature = orquestra.feature("criar fazenda", {
				context: "Fazendeiros perdem 20% da producao sem gestao centralizada",
				domain: "gestao de fazendas",
				as: "fazendeiro",
				I: "quero cadastrar uma nova fazenda",
				so: "posso gerenciar producao por talhao",
			});

			feature
				.scenario("deve criar com dados validos")
				.given("eu tenho dados validos", () => ({ fazenda: { nome: "Fazenda Boa" } }))
				.then("fazenda criada", ({ fazenda }) => {
					expect(fazenda.nome).toBe("Fazenda Boa");
				});

			await feature.test();

			const meta = orquestra.getFeatureMeta();
			const found = meta.find((m) => m.feature === "criar fazenda");

			expect(found?.context).toBe("Fazendeiros perdem 20% da producao sem gestao centralizada");
			expect(found?.domain).toBe("gestao de fazendas");
		});

		it("context e domain sao undefined quando nao definidos", async () => {
			const feature = orquestra.feature("feature sem context", {
				as: "user",
				I: "want something",
				so: "I get it",
			});

			feature
				.scenario("cenario simples")
				.given("setup", () => ({ ok: true }))
				.then("passa", ({ ok }) => {
					expect(ok).toBe(true);
				});

			await feature.test();

			const meta = orquestra.getFeatureMeta();
			const found = meta.find((m) => m.feature === "feature sem context");

			expect(found?.context).toBeUndefined();
			expect(found?.domain).toBeUndefined();
		});
	});

	describe("cenarios pendentes", () => {
		const orquestra = new Orquestra({});

		beforeAll(async () => {
			await orquestra.start();
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		it("steps sem implementacao sao marcados como pending", async () => {
			const feature = orquestra.feature("feature com pendencias", {
				as: "dev",
				I: "quero especificar antes de implementar",
				so: "o PO veja o que falta",
			});

			feature
				.scenario("cenario totalmente pendente")
				.given("uma pre-condicao qualquer")
				.when("uma acao qualquer")
				.then("um resultado esperado");

			await feature.test();

			const events = orquestra.getEvents();
			const pendingEvents = events.filter(
				(e) => e.feature === "feature com pendencias" && e.scenario === "cenario totalmente pendente",
			);

			expect(pendingEvents.length).toBe(3);
			expect(pendingEvents.every((e) => e.status === "pending")).toBe(true);
			expect(pendingEvents.every((e) => e.durationMs === undefined)).toBe(true);
		});

		it("cenario misto: steps implementados e pendentes", async () => {
			const feature = orquestra.feature("feature mista", {
				as: "dev",
				I: "quero implementar parcialmente",
				so: "vejo progresso incremental",
			});

			feature
				.scenario("cenario parcialmente implementado")
				.given("um setup implementado", () => ({ valor: 42 }))
				.when("uma acao pendente")
				.then("um resultado pendente");

			await feature.test();

			const events = orquestra.getEvents();
			const scenarioEvents = events.filter(
				(e) => e.feature === "feature mista" && e.scenario === "cenario parcialmente implementado",
			);

			expect(scenarioEvents.length).toBe(3);
			expect(scenarioEvents[0].status).toBe("success");
			expect(scenarioEvents[1].status).toBe("pending");
			expect(scenarioEvents[2].status).toBe("pending");
		});
	});

	describe("console reporter com eventos em memoria", () => {
		const orquestra = new Orquestra({});

		beforeAll(async () => {
			await orquestra.start();
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		it("reporter recebe eventos e meta corretamente", async () => {
			const feature = orquestra.feature("custom reporter feature", {
				as: "dev",
				I: "want a custom reporter",
				so: "I can export to HTML/JSON",
			});

			feature
				.scenario("execution is captured")
				.given("a trivial setup", () => ({ ok: true }))
				.then("passes", async ({ ok }) => {
					expect(ok).toBe(true);
				});

			await feature.test();

			let captured: OrquestraArtifact | null = null;

			class CapturingReporter extends OrquestraReporter {
				run(artifact: OrquestraArtifact): void {
					captured = artifact;
				}
			}

			const reporter = new CapturingReporter();
			reporter.run(buildMinimalArtifact(orquestra));

			expect(captured).not.toBeNull();
			const featureCaptured = captured!.features.find((f) => f.name === "custom reporter feature");
			expect(featureCaptured).toBeDefined();
			expect(featureCaptured?.as).toBe("dev");
			expect(featureCaptured?.scenarios.length).toBeGreaterThan(0);
		});

		it("OrquestraConsoleReporter renderiza sem erro a partir do artifact", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

			const reporter = new OrquestraConsoleReporter();
			reporter.run(buildMinimalArtifact(orquestra));

			const allOutput = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
			expect(allOutput).toContain("Feature:");
			expect(allOutput).toContain("Scenario:");

			logSpy.mockRestore();
		});
	});

	describe("rendering de step com falha", () => {
		const orquestra = new Orquestra({});

		beforeAll(async () => {
			await orquestra.start();
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		it("evento de falha contem mensagem de erro e durationMs", async () => {
			const feature = orquestra.feature("billing flow", {
				as: "customer",
				I: "want to see failures clearly",
				so: "I can fix the test quickly",
			});

			feature
				.scenario("a step intentionally fails")
				.given("a setup that works", () => ({ value: 1 }))
				.when("a step throws", () => {
					throw new Error("something went terribly wrong");
				})
				.then("never reached", () => ({}));

			await expect(feature.test()).rejects.toThrow(/something went terribly wrong/);

			const events = orquestra.getEvents();
			const failedEvent = events.find((e) => e.feature === "billing flow" && e.status === "failed");

			expect(failedEvent).toBeDefined();
			expect(failedEvent?.error?.message).toBe("something went terribly wrong");
			expect(failedEvent?.durationMs).toBeDefined();
		});

		it("console reporter imprime falha com simbolo e mensagem de erro", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

			const reporter = new OrquestraConsoleReporter();
			reporter.run(buildMinimalArtifact(orquestra));

			const allOutput = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");

			expect(allOutput).toContain("✗");
			expect(allOutput).toContain("a step throws");
			expect(allOutput).toContain("something went terribly wrong");

			logSpy.mockRestore();
		});
	});
});
