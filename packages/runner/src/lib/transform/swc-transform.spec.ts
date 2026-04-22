import ts from "typescript";
import { OrquestraTransformer } from "./swc-transform";
import type { ResolvedTsConfig } from "./tsconfig-resolver";

function tsconfig(overrides: Partial<ResolvedTsConfig> = {}): ResolvedTsConfig {
	return {
		experimentalDecorators: false,
		emitDecoratorMetadata: false,
		target: ts.ScriptTarget.ES2022,
		...overrides,
	};
}

describe("OrquestraTransformer", () => {
	it("transpila TypeScript basico para CommonJS", () => {
		const t = new OrquestraTransformer(tsconfig());
		const { code } = t.transform({
			source: "export const x: number = 42;",
			filename: "basic.ts",
		});

		expect(code).toContain("42");
		expect(code).toContain("exports");
	});

	it("emite Reflect.metadata para class properties quando legacy+metadata", () => {
		const t = new OrquestraTransformer(tsconfig({ experimentalDecorators: true, emitDecoratorMetadata: true }));

		const source = `
			function Meta(): PropertyDecorator {
				return () => undefined;
			}
			class Dto {
				@Meta() name!: string;
			}
			export { Dto };
		`;

		const { code } = t.transform({ source, filename: "dto.ts" });

		expect(code).toContain("Reflect");
		expect(code).toContain("metadata");
	});

	it("nao emite metadata quando experimentalDecorators=false", () => {
		const t = new OrquestraTransformer(tsconfig({ emitDecoratorMetadata: true }));

		const source = `
			function Meta() {}
			class Dto {
				@Meta name!: string;
			}
			export { Dto };
		`;

		const { code } = t.transform({ source, filename: "dto.ts" });

		// Sem legacyDecorator, o SWC nao processa como legacy decorators e
		// emitDecoratorMetadata nao e emitido
		expect(code).not.toContain('Reflect.metadata("design:type"');
	});

	it("aceita TSX quando filename termina em .tsx", () => {
		const t = new OrquestraTransformer(tsconfig());
		const source = "export const el = <div>hi</div>;";

		const { code } = t.transform({ source, filename: "comp.tsx" });

		expect(code).toMatch(/react|createElement|jsx/i);
	});

	it("trata class properties com decorator legacy sem explodir", () => {
		const t = new OrquestraTransformer(tsconfig({ experimentalDecorators: true, emitDecoratorMetadata: true }));

		const source = `
			function IsString(): PropertyDecorator { return () => undefined; }
			export class Dto {
				@IsString() name!: string;
				@IsString() email!: string;
			}
		`;

		expect(() => t.transform({ source, filename: "dto.ts" })).not.toThrow();
	});

	it("propaga erros de sintaxe em vez de engolir", () => {
		const t = new OrquestraTransformer(tsconfig());
		const source = "const x = {{{;";

		expect(() => t.transform({ source, filename: "broken.ts" })).toThrow();
	});

	it("respeita paths/baseUrl passando pro SWC", () => {
		const t = new OrquestraTransformer(tsconfig({ baseUrl: "/tmp/fake", paths: { "@/*": ["src/*"] } }));

		// Nao valida a resolucao em runtime (arquivos nao existem), so que nao
		// quebra quando paths esta presente.
		expect(() => t.transform({ source: "export const x = 1;", filename: "test.ts" })).not.toThrow();
	});
});
