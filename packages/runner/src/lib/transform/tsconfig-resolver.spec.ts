import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { TsConfigResolver } from "./tsconfig-resolver";

function makeTmpDir(): string {
	return mkdtempSync(join(tmpdir(), "orq-tsconfig-test-"));
}

function writeTsconfig(dir: string, content: Record<string, unknown>): string {
	const path = join(dir, "tsconfig.json");
	writeFileSync(path, JSON.stringify(content));
	return path;
}

describe("TsConfigResolver", () => {
	const createdDirs: string[] = [];

	beforeEach(() => {
		TsConfigResolver.clearCache();
	});

	afterEach(() => {
		for (const dir of createdDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function tmp(): string {
		const dir = makeTmpDir();
		createdDirs.push(dir);
		return dir;
	}

	it("detecta experimentalDecorators e emitDecoratorMetadata do tsconfig", () => {
		const dir = tmp();
		writeTsconfig(dir, {
			compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
		});

		const result = TsConfigResolver.resolve({ cwd: dir });

		expect(result.experimentalDecorators).toBe(true);
		expect(result.emitDecoratorMetadata).toBe(true);
	});

	it("retorna false quando tsconfig nao define essas flags", () => {
		const dir = tmp();
		writeTsconfig(dir, { compilerOptions: {} });

		const result = TsConfigResolver.resolve({ cwd: dir });

		expect(result.experimentalDecorators).toBe(false);
		expect(result.emitDecoratorMetadata).toBe(false);
	});

	it("mapeia compilerOptions.target", () => {
		const dir = tmp();
		writeTsconfig(dir, { compilerOptions: { target: "ES2020" } });

		const result = TsConfigResolver.resolve({ cwd: dir });

		expect(result.target).toBe(ts.ScriptTarget.ES2020);
	});

	it("default target e ES2022 quando ausente", () => {
		const dir = tmp();
		writeTsconfig(dir, { compilerOptions: {} });

		const result = TsConfigResolver.resolve({ cwd: dir });

		expect(result.target).toBe(ts.ScriptTarget.ES2022);
	});

	it("retorna DEFAULT_CONFIG quando nao encontra tsconfig na arvore", () => {
		// tmpdir em unix nao sobe ate achar algum, geralmente. Mas se subir, o teste
		// reflete a ausencia no dir criado — que e o pior caso equivalente.
		const dir = tmp();

		const result = TsConfigResolver.resolve({ cwd: dir });

		expect(result.experimentalDecorators).toBe(false);
		expect(result.emitDecoratorMetadata).toBe(false);
		expect(result.target).toBe(ts.ScriptTarget.ES2022);
	});

	it("tsconfigPath relativo resolve a partir de options.cwd (nao process.cwd)", () => {
		const dir = tmp();
		writeFileSync(
			join(dir, "tsconfig.custom.json"),
			JSON.stringify({ compilerOptions: { experimentalDecorators: true } }),
		);

		// Mesmo se process.cwd nao for o dir criado, o resolver usa options.cwd
		const result = TsConfigResolver.resolve({
			cwd: dir,
			tsconfigPath: "./tsconfig.custom.json",
		});

		expect(result.experimentalDecorators).toBe(true);
		expect(result.tsconfigPath).toBe(join(dir, "tsconfig.custom.json"));
	});

	it("tsconfigPath absoluto e usado diretamente", () => {
		const dir = tmp();
		const absPath = writeTsconfig(dir, {
			compilerOptions: { emitDecoratorMetadata: true },
		});

		const result = TsConfigResolver.resolve({
			cwd: "/some/other/path",
			tsconfigPath: absPath,
		});

		expect(result.emitDecoratorMetadata).toBe(true);
	});

	it("tsconfigPath inexistente lanca erro explicito", () => {
		const dir = tmp();

		expect(() => TsConfigResolver.resolve({ cwd: dir, tsconfigPath: "./missing.json" })).toThrow(
			/tsconfig not found at:/,
		);
	});

	it("resolve extends recursivo via TypeScript API", async () => {
		const dir = tmp();
		writeFileSync(
			join(dir, "tsconfig.base.json"),
			JSON.stringify({ compilerOptions: { experimentalDecorators: true, target: "ES2020" } }),
		);
		writeTsconfig(dir, { extends: "./tsconfig.base.json", compilerOptions: {} });

		const result = TsConfigResolver.resolve({ cwd: dir });

		expect(result.experimentalDecorators).toBe(true);
		expect(result.target).toBe(ts.ScriptTarget.ES2020);
	});

	it("cacheia por path absoluto do tsconfig resolvido", () => {
		const dir = tmp();
		writeTsconfig(dir, { compilerOptions: { experimentalDecorators: true } });

		const a = TsConfigResolver.resolve({ cwd: dir });
		const b = TsConfigResolver.resolve({ cwd: dir });

		expect(b).toBe(a);
	});

	it("cache reusa mesmo quando cwd diferentes levam ao mesmo tsconfig (via walk-up)", async () => {
		const dir = tmp();
		const subdir = join(dir, "sub");
		await mkdir(subdir);
		writeTsconfig(dir, { compilerOptions: { experimentalDecorators: true } });

		const first = TsConfigResolver.resolve({ cwd: dir });
		const second = TsConfigResolver.resolve({ cwd: subdir });

		// Ambos apontam para o mesmo tsconfig resolvido — cache retorna a mesma
		// instancia (sem re-parse)
		expect(second).toBe(first);
	});

	it("paths e baseUrl sao preservados", () => {
		const dir = tmp();
		writeTsconfig(dir, {
			compilerOptions: {
				baseUrl: "./src",
				paths: { "@/*": ["*"] },
			},
		});

		const result = TsConfigResolver.resolve({ cwd: dir });

		expect(result.baseUrl).toContain("src");
		expect(result.paths).toBeDefined();
		expect(result.paths?.["@/*"]).toEqual(["*"]);
	});
});
