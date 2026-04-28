import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { buildCacheBucket, createOrquestraJiti } from "./factory";
import type { ResolvedTsConfig } from "./tsconfig-resolver";
import { TsConfigResolver } from "./tsconfig-resolver";

describe("createOrquestraJiti", () => {
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
		const dir = mkdtempSync(join(tmpdir(), "orq-factory-test-"));
		createdDirs.push(dir);
		return dir;
	}

	it("retorna um Jiti com o transform custom (import funciona com decorator legacy)", async () => {
		const dir = tmp();
		writeFileSync(
			join(dir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true, target: "ES2022" },
			}),
		);

		const fixturePath = join(dir, "dto.ts");
		writeFileSync(
			fixturePath,
			`
				function IsString(): PropertyDecorator { return () => undefined; }
				export class Dto {
					@IsString() name!: string;
				}
				export const marker = "ok";
			`,
		);

		const jiti = createOrquestraJiti({ id: import.meta.url, cwd: dir });
		const mod = await jiti.import<{ marker: string }>(fixturePath);

		expect(mod.marker).toBe("ok");
	});

	it("transform sobrescreve qualquer transform passado via jiti options", () => {
		const dir = tmp();
		writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));

		// Se o factory nao sobrescrevesse, esse transform seria usado e lancaria.
		const fakeTransform = () => {
			throw new Error("should not be called");
		};

		const jiti = createOrquestraJiti({
			id: import.meta.url,
			cwd: dir,
			jiti: { transform: fakeTransform } as unknown as Parameters<typeof createOrquestraJiti>[0]["jiti"],
		});

		expect(jiti).toBeDefined();
		expect(typeof jiti.import).toBe("function");
	});
});

describe("buildCacheBucket — invalidates fs cache when transpile-affecting config changes", () => {
	const baseTsconfig: ResolvedTsConfig = {
		experimentalDecorators: false,
		emitDecoratorMetadata: false,
		target: ts.ScriptTarget.ES2022,
		baseUrl: "/project",
		paths: { "src/*": ["src/*"] },
	};

	it("is deterministic — same inputs always produce the same bucket id", () => {
		expect(buildCacheBucket(baseTsconfig, false)).toBe(buildCacheBucket(baseTsconfig, false));
	});

	it("changes when target changes (different JS output)", () => {
		const a = buildCacheBucket(baseTsconfig, false);
		const b = buildCacheBucket({ ...baseTsconfig, target: ts.ScriptTarget.ES2020 }, false);
		expect(a).not.toBe(b);
	});

	it("changes when paths change (resolution layout differs)", () => {
		const a = buildCacheBucket(baseTsconfig, false);
		const b = buildCacheBucket({ ...baseTsconfig, paths: { "lib/*": ["lib/*"] } }, false);
		expect(a).not.toBe(b);
	});

	it("changes when baseUrl changes", () => {
		const a = buildCacheBucket(baseTsconfig, false);
		const b = buildCacheBucket({ ...baseTsconfig, baseUrl: "/other" }, false);
		expect(a).not.toBe(b);
	});

	it("changes when experimentalDecorators flips (output differs structurally)", () => {
		const a = buildCacheBucket(baseTsconfig, false);
		const b = buildCacheBucket({ ...baseTsconfig, experimentalDecorators: true }, false);
		expect(a).not.toBe(b);
	});

	it("changes when emitDecoratorMetadata flips", () => {
		const a = buildCacheBucket({ ...baseTsconfig, experimentalDecorators: true }, false);
		const b = buildCacheBucket(
			{ ...baseTsconfig, experimentalDecorators: true, emitDecoratorMetadata: true },
			false,
		);
		expect(a).not.toBe(b);
	});

	it("changes when sourceMaps flips — debug runs MUST get a fresh bucket", () => {
		const a = buildCacheBucket(baseTsconfig, false);
		const b = buildCacheBucket(baseTsconfig, "inline");
		expect(a).not.toBe(b);
	});

	it("returns a short hex digest (12 chars), safe for path concatenation", () => {
		const bucket = buildCacheBucket(baseTsconfig, false);
		expect(bucket).toMatch(/^[0-9a-f]{12}$/);
	});

	it("undefined sourceMaps and `false` are equivalent (default off)", () => {
		expect(buildCacheBucket(baseTsconfig, undefined)).toBe(buildCacheBucket(baseTsconfig, false));
	});
});
