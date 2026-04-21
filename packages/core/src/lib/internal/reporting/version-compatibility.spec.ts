import { assertCompatible } from "./version-compatibility";

describe("assertCompatible", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("nao warna nem lanca quando as versoes sao iguais", () => {
		expect(() => assertCompatible("1.2.3", "1.2.3")).not.toThrow();
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("nao warna nem lanca quando so o patch difere", () => {
		expect(() => assertCompatible("1.2.3", "1.2.9")).not.toThrow();
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("warna quando o minor difere mas o major e igual", () => {
		expect(() => assertCompatible("1.2.0", "1.5.0")).not.toThrow();
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(warnSpy.mock.calls[0][0]).toContain("minor divergente");
	});

	it("lanca quando o major difere", () => {
		expect(() => assertCompatible("2.0.0", "1.0.0")).toThrow(/major divergente/i);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("lanca com mensagem contendo ambas as versoes", () => {
		try {
			assertCompatible("3.1.4", "1.0.0");
			expect.fail("deveria ter lancado");
		} catch (e: any) {
			expect(e.message).toContain("3.1.4");
			expect(e.message).toContain("1.0.0");
		}
	});

	it("warna e retorna quando a versao do manifest e invalida", () => {
		expect(() => assertCompatible("invalido", "1.2.3")).not.toThrow();
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(warnSpy.mock.calls[0][0]).toContain("pulando check");
	});

	it("warna e retorna quando a versao atual e invalida", () => {
		expect(() => assertCompatible("1.2.3", "")).not.toThrow();
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(warnSpy.mock.calls[0][0]).toContain("pulando check");
	});

	it("aceita sufixos semver (pre-release) considerando apenas major.minor.patch", () => {
		expect(() => assertCompatible("1.2.3-beta", "1.2.3")).not.toThrow();
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("trata prefixo 'v' como versao invalida", () => {
		expect(() => assertCompatible("v1.2.3", "1.2.3")).not.toThrow();
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(warnSpy.mock.calls[0][0]).toContain("pulando check");
	});
});
