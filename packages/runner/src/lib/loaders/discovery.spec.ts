import { _discovery } from "./discovery";

describe("discovery internals", () => {
	describe("isInsideNodeModules (M4)", () => {
		it("excludes paths with `node_modules` as a segment", () => {
			expect(_discovery.isInsideNodeModules("foo/node_modules/bar")).toBe(true);
			expect(_discovery.isInsideNodeModules("node_modules/bar")).toBe(true);
			expect(_discovery.isInsideNodeModules("a\\node_modules\\b")).toBe(true);
		});

		it("does NOT exclude directories that merely contain the substring", () => {
			expect(_discovery.isInsideNodeModules("e2e/node_modules_archive/x")).toBe(false);
			expect(_discovery.isInsideNodeModules("foo/my_node_modules/bar")).toBe(false);
			expect(_discovery.isInsideNodeModules("node_modules_old")).toBe(false);
		});
	});

	describe("compileFilter (M5)", () => {
		it("does case-insensitive substring matching by default", () => {
			const m = _discovery.compileFilter("LOGIN");
			expect(m("/abs/login.feature.ts")).toBe(true);
			expect(m("/abs/Login.feature.ts")).toBe(true);
			expect(m("/abs/users.feature.ts")).toBe(false);
		});

		it("treats `/.../flags` as a regex", () => {
			const m = _discovery.compileFilter("/^\\/abs\\/.*login\\.feature\\.ts$/i");
			expect(m("/abs/Login.feature.ts")).toBe(true);
			expect(m("/abs/sub/login.feature.ts")).toBe(true);
			expect(m("/other/login.feature.ts")).toBe(false);
		});

		it("regex flags are honored (e.g. case-sensitive without `i`)", () => {
			const m = _discovery.compileFilter("/login/");
			expect(m("/abs/login.feature.ts")).toBe(true);
			expect(m("/abs/Login.feature.ts")).toBe(false);
		});
	});
});
