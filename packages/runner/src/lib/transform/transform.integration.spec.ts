import "reflect-metadata";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOrquestraJiti } from "./factory";
import { TsConfigResolver } from "./tsconfig-resolver";

function makeTmp(): string {
	return mkdtempSync(join(tmpdir(), "orq-transform-it-"));
}

function writeTsconfig(dir: string, content: Record<string, unknown>): string {
	const path = join(dir, "tsconfig.json");
	writeFileSync(path, JSON.stringify(content));
	return path;
}

describe("transform pipeline (integration)", () => {
	const dirs: string[] = [];

	beforeEach(() => {
		TsConfigResolver.clearCache();
	});

	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function tmp(): string {
		const dir = makeTmp();
		dirs.push(dir);
		return dir;
	}

	describe("projeto estilo Nest/TypeORM (legacy decorators + emitDecoratorMetadata)", () => {
		it("carrega DTO com decorator em class property e emite Reflect metadata consultavel", async () => {
			const dir = tmp();
			writeTsconfig(dir, {
				compilerOptions: {
					experimentalDecorators: true,
					emitDecoratorMetadata: true,
					target: "ES2022",
				},
			});

			const dtoPath = join(dir, "dto.ts");
			await writeFile(
				dtoPath,
				`


					function StringField(): PropertyDecorator {
						return (target, key) => {
							const type = Reflect.getMetadata("design:type", target, key);
							Reflect.defineMetadata("orq:validator", type?.name ?? "unknown", target, key);
						};
					}

					export class CreateUserDto {
						@StringField() name!: string;
						@StringField() email!: string;
					}
				`,
			);

			const jiti = createOrquestraJiti({ id: import.meta.url, cwd: dir });
			const mod = await jiti.import<{ CreateUserDto: new () => unknown }>(dtoPath);

			// Instanciar nao deve explodir
			const dto = new mod.CreateUserDto();
			expect(dto).toBeInstanceOf(mod.CreateUserDto);

			// Metadata do tipo runtime disponivel (prova de que emitDecoratorMetadata funcionou)
			const validator = Reflect.getMetadata("orq:validator", mod.CreateUserDto.prototype, "name");
			expect(validator).toBe("String");
		});

		it("propaga decorators e metadata por cadeia de imports TS", async () => {
			const dir = tmp();
			writeTsconfig(dir, {
				compilerOptions: {
					experimentalDecorators: true,
					emitDecoratorMetadata: true,
				},
			});

			await writeFile(
				join(dir, "base.ts"),
				`

					export function Injectable(): ClassDecorator {
						return (target) => { Reflect.defineMetadata("orq:injectable", true, target); };
					}
				`,
			);
			await writeFile(
				join(dir, "service.ts"),
				`
					import { Injectable } from "./base";
					@Injectable()
					export class UserService {
						greet(): string { return "ok"; }
					}
				`,
			);

			const jiti = createOrquestraJiti({ id: import.meta.url, cwd: dir });
			const mod = await jiti.import<{ UserService: new () => { greet(): string } }>(join(dir, "service.ts"));

			expect(new mod.UserService().greet()).toBe("ok");
			expect(Reflect.getMetadata("orq:injectable", mod.UserService)).toBe(true);
		});
	});

	describe("projeto sem experimentalDecorators", () => {
		it("transpila TypeScript comum sem emitir metadata", async () => {
			const dir = tmp();
			writeTsconfig(dir, { compilerOptions: { target: "ES2022" } });

			const filePath = join(dir, "plain.ts");
			await writeFile(
				filePath,
				`

					export class Plain {
						name!: string;
					}
				`,
			);

			const jiti = createOrquestraJiti({ id: import.meta.url, cwd: dir });
			const mod = await jiti.import<{ Plain: new () => unknown }>(filePath);

			expect(new mod.Plain()).toBeInstanceOf(mod.Plain);
			// Sem legacy nem metadata: nenhum Reflect.metadata emitido para o campo
			expect(Reflect.getMetadata("design:type", mod.Plain.prototype, "name")).toBeUndefined();
		});
	});

	describe("override explicito via tsconfigPath (equivalente a flag --tsconfig)", () => {
		it("ignora auto-discovery e usa tsconfig passado explicitamente", async () => {
			const dir = tmp();
			// auto-discovery acharia esse
			writeTsconfig(dir, { compilerOptions: {} });
			// mas vamos forcar outro com legacy=true
			const customPath = join(dir, "tsconfig.custom.json");
			writeFileSync(
				customPath,
				JSON.stringify({
					compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
				}),
			);

			const filePath = join(dir, "dto.ts");
			await writeFile(
				filePath,
				`

					function M(): PropertyDecorator { return () => undefined; }
					export class X {
						@M() field!: string;
					}
				`,
			);

			const jiti = createOrquestraJiti({
				id: import.meta.url,
				cwd: dir,
				tsconfigPath: customPath,
			});
			const mod = await jiti.import<{ X: new () => unknown }>(filePath);

			// Com custom tsconfig (legacy=true), metadata e emitida mesmo que o
			// auto-discovery tivesse pegado o outro (sem legacy).
			expect(Reflect.getMetadata("design:type", mod.X.prototype, "field")).toBeDefined();
		});

		it("aceita tsconfigPath relativo resolvido a partir de options.cwd", async () => {
			const dir = tmp();
			const customPath = join(dir, "tsconfig.test.json");
			writeFileSync(
				customPath,
				JSON.stringify({
					compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
				}),
			);

			const filePath = join(dir, "dto.ts");
			await writeFile(
				filePath,
				`

					function M(): PropertyDecorator { return () => undefined; }
					export class Y { @M() f!: string; }
				`,
			);

			const jiti = createOrquestraJiti({
				id: import.meta.url,
				cwd: dir,
				tsconfigPath: "./tsconfig.test.json",
			});
			const mod = await jiti.import<{ Y: new () => unknown }>(filePath);

			expect(new mod.Y()).toBeInstanceOf(mod.Y);
			expect(Reflect.getMetadata("design:type", mod.Y.prototype, "f")).toBeDefined();
		});

		it("falha de forma clara quando tsconfigPath nao existe", () => {
			const dir = tmp();
			expect(() =>
				createOrquestraJiti({
					id: import.meta.url,
					cwd: dir,
					tsconfigPath: "./missing.json",
				}),
			).toThrow(/tsconfig not found at:/);
		});
	});

	describe("isolamento de cache entre projetos diferentes", () => {
		it("dois tsconfigs distintos sao resolvidos independentemente no mesmo processo", async () => {
			const projA = tmp();
			const projB = tmp();

			writeTsconfig(projA, {
				compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
			});
			writeTsconfig(projB, {
				compilerOptions: {}, // sem decorators
			});

			// Arquivo "equivalente" nos dois projetos — metadata emitida so em A
			const dtoSrc = `

				function M(): PropertyDecorator { return () => undefined; }
				export class D { @M() f!: string; }
			`;
			await writeFile(join(projA, "dto.ts"), dtoSrc);
			await writeFile(join(projB, "dto.ts"), dtoSrc);

			const jitiA = createOrquestraJiti({ id: import.meta.url, cwd: projA });
			const jitiB = createOrquestraJiti({ id: import.meta.url, cwd: projB });

			const modA = await jitiA.import<{ D: new () => unknown }>(join(projA, "dto.ts"));
			const modB = await jitiB.import<{ D: new () => unknown }>(join(projB, "dto.ts"));

			expect(Reflect.getMetadata("design:type", modA.D.prototype, "f")).toBeDefined();
			expect(Reflect.getMetadata("design:type", modB.D.prototype, "f")).toBeUndefined();
		});

		it("walk-up de tsconfig funciona a partir de subdiretorios", async () => {
			const root = tmp();
			const subdir = join(root, "src", "modules");
			await mkdir(subdir, { recursive: true });

			writeTsconfig(root, {
				compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
			});

			const dtoPath = join(subdir, "dto.ts");
			await writeFile(
				dtoPath,
				`

					function M(): PropertyDecorator { return () => undefined; }
					export class Deep { @M() f!: string; }
				`,
			);

			// cwd e o subdir profundo; resolver sobe a arvore ate achar o tsconfig
			const jiti = createOrquestraJiti({ id: import.meta.url, cwd: subdir });
			const mod = await jiti.import<{ Deep: new () => unknown }>(dtoPath);

			expect(Reflect.getMetadata("design:type", mod.Deep.prototype, "f")).toBeDefined();
		});
	});

	describe("propagacao de erros de transpilacao", () => {
		it("erro de sintaxe do SWC e propagado (nao retorna modulo vazio)", async () => {
			const dir = tmp();
			writeTsconfig(dir, { compilerOptions: {} });

			const badPath = join(dir, "broken.ts");
			await writeFile(badPath, "const x = {{{ broken syntax");

			const jiti = createOrquestraJiti({ id: import.meta.url, cwd: dir });

			await expect(jiti.import(badPath)).rejects.toBeDefined();
		});
	});

	describe("tsconfig com extends", () => {
		it("herda configs via extends do tsconfig base", async () => {
			const dir = tmp();
			writeFileSync(
				join(dir, "tsconfig.base.json"),
				JSON.stringify({
					compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
				}),
			);
			writeTsconfig(dir, { extends: "./tsconfig.base.json", compilerOptions: {} });

			const filePath = join(dir, "dto.ts");
			await writeFile(
				filePath,
				`

					function M(): PropertyDecorator { return () => undefined; }
					export class Z { @M() f!: string; }
				`,
			);

			const jiti = createOrquestraJiti({ id: import.meta.url, cwd: dir });
			const mod = await jiti.import<{ Z: new () => unknown }>(filePath);

			expect(Reflect.getMetadata("design:type", mod.Z.prototype, "f")).toBeDefined();
		});
	});
});
