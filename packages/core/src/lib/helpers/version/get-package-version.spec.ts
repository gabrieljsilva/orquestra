describe("getPackageVersion", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("retorna a versao real de @orquestra/core no monorepo", async () => {
		const { getPackageVersion } = await import("./get-package-version");
		const version = getPackageVersion();
		expect(version).toMatch(/^\d+\.\d+\.\d+/);
		expect(version).not.toBe("0.0.0");
	});

	it("memoiza a versao entre chamadas (retorna mesmo valor mesmo apos mudar cwd)", async () => {
		const { getPackageVersion } = await import("./get-package-version");
		const first = getPackageVersion();

		const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/nonexistent-path-for-cache-test");
		try {
			const second = getPackageVersion();
			expect(second).toBe(first);
		} finally {
			cwdSpy.mockRestore();
		}
	});

	it("expoe UNKNOWN_PACKAGE_VERSION como '0.0.0'", async () => {
		const mod = await import("./get-package-version");
		expect(mod.UNKNOWN_PACKAGE_VERSION).toBe("0.0.0");
	});
});
