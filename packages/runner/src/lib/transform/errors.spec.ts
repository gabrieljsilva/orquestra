import { SwcNotAvailableError } from "./errors";

describe("SwcNotAvailableError", () => {
	it("tem nome proprio e mensagem instrutiva", () => {
		const err = new SwcNotAvailableError(new Error("boom"));

		expect(err.name).toBe("SwcNotAvailableError");
		expect(err.message).toContain("Unable to load @swc/core");
		expect(err.message).toContain("postinstall");
		expect(err.message).toContain("boom");
	});

	it("propaga cause passada no construtor", () => {
		const cause = new Error("root cause");
		const err = new SwcNotAvailableError(cause);

		expect(err.cause).toBe(cause);
	});

	it("aceita cause nao-Error e serializa na mensagem", () => {
		const err = new SwcNotAvailableError("string error");

		expect(err.message).toContain("string error");
		expect(err.cause).toBe("string error");
	});

	it("e instancia de Error", () => {
		const err = new SwcNotAvailableError(new Error("x"));
		expect(err).toBeInstanceOf(Error);
	});
});
