import { orquestraVitest } from "./plugin";

function transform(code: string, id: string, opts?: Parameters<typeof orquestraVitest>[0]) {
	const plugin = orquestraVitest(opts);
	const handler = plugin.transform as (code: string, id: string) => unknown;
	const ctx = { error: () => undefined };
	return handler.call(ctx, code, id);
}

describe("orquestraVitest plugin", () => {
	it("appends runFeatures() to a spec file that imports the bridge", () => {
		const result = transform(
			`import { defineFeature } from "@orquestra/vitest";\nconst f = defineFeature("X");\n`,
			"/abs/path/foo.spec.ts",
		) as { code: string; map: null };

		expect(result.code).toContain('from "@orquestra/vitest"');
		expect(result.code).toContain("__orquestraRunFeatures__()");
	});

	it("matches both .spec.ts and .test.ts and .feature.ts", () => {
		for (const id of ["x.spec.ts", "x.test.ts", "x.feature.ts"]) {
			const result = transform(`import {} from "@orquestra/vitest";\n`, id);
			expect(result).not.toBeNull();
		}
	});

	it("matches .tsx, .js, .jsx, .mts, .cts", () => {
		for (const id of ["x.spec.tsx", "x.spec.js", "x.spec.jsx", "x.spec.mts", "x.spec.cts"]) {
			const result = transform(`import {} from "@orquestra/vitest";\n`, id);
			expect(result).not.toBeNull();
		}
	});

	it("skips files that don't import from @orquestra/vitest", () => {
		const result = transform(`import { foo } from "lodash";\n`, "x.spec.ts");
		expect(result).toBeNull();
	});

	it("skips files that already call runFeatures() explicitly (both styles co-exist)", () => {
		const code = [
			'import { defineFeature, runFeatures } from "@orquestra/vitest";',
			'const f = defineFeature("X");',
			"runFeatures();",
		].join("\n");
		expect(transform(code, "x.spec.ts")).toBeNull();
	});

	it("skips non-spec files (e.g., a regular source file that imports the bridge)", () => {
		const result = transform(`import {} from "@orquestra/vitest";`, "src/utils/helper.ts");
		expect(result).toBeNull();
	});

	it("respects a custom include regex", () => {
		const code = `import {} from "@orquestra/vitest";`;

		const stdId = "x.spec.ts";
		const customId = "x.bdd.ts";

		// Without override — only standard pattern matches.
		expect(transform(code, customId)).toBeNull();
		// With override — only the custom pattern matches.
		expect(transform(code, stdId, { include: /\.bdd\.ts$/ })).toBeNull();
		expect(transform(code, customId, { include: /\.bdd\.ts$/ })).not.toBeNull();
	});

	it("uses an aliased import to avoid colliding with the user's own runFeatures import", () => {
		const result = transform(
			`import { defineFeature } from "@orquestra/vitest";\n`,
			"x.spec.ts",
		) as { code: string };

		// The injected snippet aliases to a unique symbol so even if user
		// later writes `runFeatures` for some other purpose, no clash.
		expect(result.code).toContain("__orquestraRunFeatures__");
	});

	it("returns null map (Vite generates an identity map for end-of-file appends)", () => {
		const result = transform(
			`import {} from "@orquestra/vitest";\n`,
			"x.spec.ts",
		) as { map: null };
		expect(result.map).toBeNull();
	});
});
