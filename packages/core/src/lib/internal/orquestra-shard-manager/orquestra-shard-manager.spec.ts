import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ORQUESTRA_RUN_ID_ENV } from "../../constants/shard-manager";
import { OrquestraShardManager } from "./orquestra-shard-manager";

describe("OrquestraShardManager", () => {
	let tempRoot: string;
	let cwdSpy: ReturnType<typeof vi.spyOn>;
	let originalRunId: string | undefined;

	beforeEach(() => {
		tempRoot = mkdtempSync(join(tmpdir(), "orquestra-shard-"));
		cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempRoot);
		originalRunId = process.env[ORQUESTRA_RUN_ID_ENV];
		delete process.env[ORQUESTRA_RUN_ID_ENV];
	});

	afterEach(() => {
		cwdSpy.mockRestore();
		rmSync(tempRoot, { recursive: true, force: true });
		if (originalRunId === undefined) delete process.env[ORQUESTRA_RUN_ID_ENV];
		else process.env[ORQUESTRA_RUN_ID_ENV] = originalRunId;
	});

	describe("manifest", () => {
		it("persiste e le manifest via roundtrip", () => {
			const shards = new OrquestraShardManager();
			const manifest = { orquestraVersion: "1.2.3", createdAt: "2026-04-21T12:00:00.000Z", runId: shards.getRunId() };

			shards.writeManifest(manifest);
			const read = shards.readManifest();

			expect(read).toEqual(manifest);
		});

		it("retorna null quando manifest.json nao existe", () => {
			const shards = new OrquestraShardManager();
			expect(shards.readManifest()).toBeNull();
		});
	});

	describe("meta", () => {
		it("persiste e le meta via roundtrip", () => {
			const shards = new OrquestraShardManager();
			const meta = [{ feature: "f1", as: "user", I: "want x", so: "y" }];

			shards.writeMeta(meta);
			expect(shards.readMeta()).toEqual(meta);
		});

		it("retorna array vazio quando meta.json nao existe", () => {
			const shards = new OrquestraShardManager();
			expect(shards.readMeta()).toEqual([]);
		});
	});

	describe("readEvents", () => {
		it("ignora manifest.json e meta.json ao ler eventos", () => {
			const shards = new OrquestraShardManager();
			shards.writeManifest({ orquestraVersion: "1.0.0", createdAt: "t", runId: shards.getRunId() });
			shards.writeMeta([{ feature: "f", as: "a", I: "i", so: "s" }]);

			shards.write({
				runId: shards.getRunId(),
				workerPid: process.pid,
				feature: "f",
				scenario: "sc",
				stepId: "s1",
				stepName: "n",
				keyword: "Given",
				ts: "t",
				status: "success",
			});

			const events = shards.readEvents();
			expect(events).toHaveLength(1);
			expect(events[0].stepId).toBe("s1");
		});

		it("ignora arquivos .json fora do padrao de evento", () => {
			const shards = new OrquestraShardManager();
			const dir = shards.getRootDir();
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "random.json"), "{}");
			writeFileSync(join(dir, "not-an-event.json"), "{}");

			expect(shards.readEvents()).toEqual([]);
		});

		it("retorna [] quando o diretorio do run nao existe", () => {
			const shards = new OrquestraShardManager();
			expect(shards.readEvents()).toEqual([]);
		});
	});

	describe("listRuns", () => {
		it("retorna somente diretorios com nome em formato UUID", () => {
			const orquestraDir = join(tempRoot, ".orquestra");
			mkdirSync(orquestraDir, { recursive: true });
			mkdirSync(join(orquestraDir, "11111111-1111-1111-1111-111111111111"));
			mkdirSync(join(orquestraDir, "not-a-uuid"));
			writeFileSync(join(orquestraDir, "stray-file.json"), "{}");

			const shards = new OrquestraShardManager();
			const runs = shards.listRuns();
			const runIds = runs.map((r) => r.runId).sort();

			expect(runIds).toContain("11111111-1111-1111-1111-111111111111");
			expect(runIds).not.toContain("not-a-uuid");
			expect(runIds).not.toContain("stray-file.json");
		});

		it("retorna [] quando .orquestra/ nao existe", () => {
			const shards = new OrquestraShardManager();
			expect(shards.listRuns()).toEqual([]);
		});
	});

	describe("cleanupOldRuns", () => {
		function seedRun(runId: string, mtimeOffsetMs: number): void {
			const orquestraDir = join(tempRoot, ".orquestra");
			mkdirSync(orquestraDir, { recursive: true });
			const runDir = join(orquestraDir, runId);
			mkdirSync(runDir, { recursive: true });
			const t = Date.now() - mtimeOffsetMs;
			// mexer no mtime do diretorio para simular ordenacao por idade
			const { utimesSync } = require("node:fs");
			utimesSync(runDir, t / 1000, t / 1000);
		}

		it("com limit=1 apaga todos os runs antigos mantendo o atual", () => {
			seedRun("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", 10_000);
			seedRun("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", 5_000);

			const shards = new OrquestraShardManager();
			shards.writeManifest({ orquestraVersion: "1", createdAt: "t", runId: shards.getRunId() });
			shards.cleanupOldRuns(1);

			const orquestraDir = join(tempRoot, ".orquestra");
			expect(existsSync(join(orquestraDir, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"))).toBe(false);
			expect(existsSync(join(orquestraDir, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"))).toBe(false);
			expect(existsSync(shards.getRootDir())).toBe(true);
		});

		it("com limit=3 mantem os 2 runs antigos mais recentes + o atual", () => {
			seedRun("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", 30_000);
			seedRun("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1", 20_000);
			seedRun("cccccccc-cccc-cccc-cccc-ccccccccccc1", 10_000);

			const shards = new OrquestraShardManager();
			shards.writeManifest({ orquestraVersion: "1", createdAt: "t", runId: shards.getRunId() });
			shards.cleanupOldRuns(3);

			const orquestraDir = join(tempRoot, ".orquestra");
			// mais antigo vai embora
			expect(existsSync(join(orquestraDir, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"))).toBe(false);
			// dois mais recentes permanecem
			expect(existsSync(join(orquestraDir, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1"))).toBe(true);
			expect(existsSync(join(orquestraDir, "cccccccc-cccc-cccc-cccc-ccccccccccc1"))).toBe(true);
			// o atual permanece
			expect(existsSync(shards.getRootDir())).toBe(true);
		});

		it("com limit < 1 nao apaga nada", () => {
			seedRun("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", 10_000);
			const shards = new OrquestraShardManager();
			shards.cleanupOldRuns(0);

			expect(existsSync(join(tempRoot, ".orquestra", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"))).toBe(true);
		});

		it("nunca apaga o run atual, mesmo que seja o mais antigo", () => {
			const shards = new OrquestraShardManager();
			// grava algo para criar o diretorio do run atual
			shards.writeManifest({ orquestraVersion: "1", createdAt: "t", runId: shards.getRunId() });
			// seeds de outros runs mais recentes
			seedRun("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", -5_000);
			seedRun("cccccccc-cccc-cccc-cccc-cccccccccccc", -10_000);

			shards.cleanupOldRuns(1);
			expect(existsSync(shards.getRootDir())).toBe(true);
		});
	});
});
