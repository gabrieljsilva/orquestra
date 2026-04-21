import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type FeatureMeta,
	Orquestra,
	OrquestraConsoleReporter,
	OrquestraReporter,
	type RunManifest,
	type StepEvent,
} from "@orquestra/core";

const RUN_ID_ENV = "__ORQUESTRA_RUN_ID__";

function orquestraDir(): string {
	return join(process.cwd(), ".orquestra");
}

function runDir(runId: string): string {
	return join(orquestraDir(), runId);
}

function resetRunId(): void {
	delete process.env[RUN_ID_ENV];
}

describe("reporting", () => {
	describe("manifest.json", () => {
		const orquestra = new Orquestra({});
		let runId: string;

		beforeAll(async () => {
			await orquestra.start();
			runId = process.env.__ORQUESTRA_RUN_ID__ as string;
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		it("persiste manifest.json apos orquestra.start() com versao, runId e createdAt", () => {
			const path = join(runDir(runId), "manifest.json");
			expect(existsSync(path)).toBe(true);

			const manifest = JSON.parse(readFileSync(path, "utf8")) as RunManifest;
			expect(manifest.runId).toBe(runId);
			expect(manifest.orquestraVersion).toMatch(/^\d+\.\d+\.\d+/);
			expect(new Date(manifest.createdAt).toString()).not.toBe("Invalid Date");
		});
	});

	describe("meta.json", () => {
		const orquestra = new Orquestra({});
		let runId: string;

		beforeAll(async () => {
			await orquestra.start();
			runId = process.env.__ORQUESTRA_RUN_ID__ as string;

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
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		it("grava meta.json com os campos as/I/so da feature apos feature.test()", () => {
			const path = join(runDir(runId), "meta.json");
			expect(existsSync(path)).toBe(true);

			const meta = JSON.parse(readFileSync(path, "utf8")) as FeatureMeta[];
			expect(meta).toEqual([
				{
					feature: "manage account",
					as: "authenticated user",
					I: "want to update my profile",
					so: "my data stays accurate",
				},
			]);
		});

		it("nao inclui manifest.json nem meta.json na lista de step events", () => {
			const path = runDir(runId);
			const files = readdirSync(path);
			expect(files).toContain("manifest.json");
			expect(files).toContain("meta.json");
			const eventFiles = files.filter((f) => /^\d+-\d+-[a-z0-9]+\.json$/.test(f));
			expect(eventFiles.length).toBeGreaterThan(0);
		});
	});

	describe("orquestra.report() opt-in", () => {
		const orquestra = new Orquestra({});

		beforeAll(async () => {
			await orquestra.start();
		});

		afterAll(async () => {
			await orquestra.teardown();
		});

		it("nao imprime nada no teardown por default (reporter e opt-in)", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

			const temp = new Orquestra({});
			await temp.start();
			await temp.teardown();

			const featureLines = logSpy.mock.calls.filter((args) => args.join(" ").includes("Feature:"));
			expect(featureLines).toHaveLength(0);
			logSpy.mockRestore();
		});

		it("permite chamar report() com reporter customizado recebendo events+meta", async () => {
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

			let captured: { events: StepEvent[]; meta: FeatureMeta[] } | null = null;

			class CapturingReporter extends OrquestraReporter {
				run(events: StepEvent[], meta: FeatureMeta[]): void {
					captured = { events, meta };
				}
			}

			await orquestra.report(new CapturingReporter());

			if (!captured) throw new Error("reporter não foi executado");
			const metaCaptured = captured.meta.find((m) => m.feature === "custom reporter feature");
			expect(metaCaptured).toBeDefined();
			expect(metaCaptured?.as).toBe("dev");

			const eventsCaptured = captured.events.filter((e) => e.feature === "custom reporter feature");
			expect(eventsCaptured.length).toBeGreaterThan(0);
			expect(eventsCaptured.every((e) => ["pending", "success"].includes(e.status))).toBe(true);
		});

		it("executa OrquestraConsoleReporter sem erro mesmo com report() chamado duas vezes", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

			await orquestra.report(new OrquestraConsoleReporter());
			await orquestra.report(new OrquestraConsoleReporter());

			const featureLines = logSpy.mock.calls.filter((args) => args.join(" ").includes("Feature:"));
			expect(featureLines.length).toBeGreaterThanOrEqual(2);

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

		it("imprime step failed com simbolo vermelho e mensagem do erro no console reporter", async () => {
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

			const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
			await orquestra.report(new OrquestraConsoleReporter());
			const allOutput = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");

			expect(allOutput).toContain("✗");
			expect(allOutput).toContain("a step throws");
			expect(allOutput).toContain("something went terribly wrong");
			expect(allOutput).toContain("○");
			expect(allOutput).toContain("never reached");

			logSpy.mockRestore();
		});
	});

	describe("compatibilidade semver com manifest forjado", () => {
		beforeEach(() => {
			resetRunId();
		});

		it("lanca quando o manifest tem major divergente", async () => {
			const orquestra = new Orquestra({});
			await orquestra.start();

			const manifestPath = join(runDir(process.env[RUN_ID_ENV] as string), "manifest.json");
			const currentManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RunManifest;
			const [, minor, patch] = currentManifest.orquestraVersion.split(".");
			const forgedMajor = `99.${minor}.${patch}`;
			writeFileSync(manifestPath, JSON.stringify({ ...currentManifest, orquestraVersion: forgedMajor }));

			await expect(orquestra.report(new OrquestraConsoleReporter())).rejects.toThrow(/major divergente/);

			await orquestra.teardown();
		});

		it("emite warning quando o manifest tem minor divergente mas nao lanca", async () => {
			const orquestra = new Orquestra({});
			await orquestra.start();

			const manifestPath = join(runDir(process.env[RUN_ID_ENV] as string), "manifest.json");
			const currentManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RunManifest;
			const [major, , patch] = currentManifest.orquestraVersion.split(".");
			const forgedMinor = `${major}.999.${patch}`;
			writeFileSync(manifestPath, JSON.stringify({ ...currentManifest, orquestraVersion: forgedMinor }));

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

			await expect(orquestra.report(new OrquestraConsoleReporter())).resolves.toBeUndefined();

			const allWarnings = warnSpy.mock.calls.map((args) => args.join(" ")).join("\n");
			expect(allWarnings).toContain("minor divergente");

			warnSpy.mockRestore();
			await orquestra.teardown();
		});

		it("warna e prossegue quando o manifest nao existe (run legado pre-versionamento)", async () => {
			// simula run criado por versao anterior: nao ha manifest.json
			const runId = "legacy-run-00000000-0000-0000-0000-000000000001";
			mkdirSync(runDir(runId), { recursive: true });
			process.env[RUN_ID_ENV] = runId;

			const orquestra = new Orquestra({ historyLimit: 99 }); // evita apagar o run forjado
			// nao chamamos start() para nao sobrescrever o manifest; chamada de report direta
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

			await expect(orquestra.report(new OrquestraConsoleReporter())).resolves.toBeUndefined();

			const allWarnings = warnSpy.mock.calls.map((args) => args.join(" ")).join("\n");
			expect(allWarnings).toContain("Run sem manifest");

			warnSpy.mockRestore();
		});
	});

	describe("historyLimit — lifecycle entre runs consecutivos", () => {
		beforeEach(() => {
			resetRunId();
		});

		it("com historyLimit=1 (default), o segundo start apaga o diretorio do run anterior", async () => {
			const orquestra1 = new Orquestra({});
			await orquestra1.start();
			const firstRunId = process.env[RUN_ID_ENV] as string;
			expect(existsSync(runDir(firstRunId))).toBe(true);
			await orquestra1.teardown();

			resetRunId();

			const orquestra2 = new Orquestra({});
			await orquestra2.start();
			const secondRunId = process.env[RUN_ID_ENV] as string;

			expect(secondRunId).not.toBe(firstRunId);
			expect(existsSync(runDir(firstRunId))).toBe(false);
			expect(existsSync(runDir(secondRunId))).toBe(true);

			await orquestra2.teardown();
		});

		it("com historyLimit=3 mantem os 2 runs antigos mais recentes alem do atual", async () => {
			const runIds: string[] = [];

			for (let i = 0; i < 4; i++) {
				resetRunId();
				const o = new Orquestra({ historyLimit: 3 });
				await o.start();
				runIds.push(process.env[RUN_ID_ENV] as string);
				await o.teardown();
			}

			// o run 0 deve ter sido apagado; os ultimos 3 permanecem
			expect(existsSync(runDir(runIds[0]))).toBe(false);
			expect(existsSync(runDir(runIds[1]))).toBe(true);
			expect(existsSync(runDir(runIds[2]))).toBe(true);
			expect(existsSync(runDir(runIds[3]))).toBe(true);
		});
	});
});
