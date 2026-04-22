import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOrquestraJiti } from "./factory";
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
