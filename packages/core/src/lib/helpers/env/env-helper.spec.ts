import type { IOrquestraContext } from "../../types";
import { EnvHelper } from "./env-helper";

function makeCtx(): IOrquestraContext {
	return { container: { register: () => undefined, get: () => undefined } } as unknown as IOrquestraContext;
}

describe("EnvHelper", () => {
	let originalFoo: string | undefined;

	beforeEach(() => {
		originalFoo = process.env.FOO;
	});

	afterEach(() => {
		if (originalFoo === undefined) delete process.env.FOO;
		else process.env.FOO = originalFoo;
	});

	it("override grava no process.env e no state interno", () => {
		const env = new EnvHelper(makeCtx(), { fromValues: { FOO: "bar" } });
		env.override("FOO", "zero");

		expect(env.get("FOO")).toBe("zero");
		expect(process.env.FOO).toBe("zero");
	});

	it("restore volta o valor ao snapshot inicial", () => {
		process.env.FOO = "bar";
		const env = new EnvHelper(makeCtx());

		env.override("FOO", "zero");
		expect(env.get("FOO")).toBe("zero");

		env.restore("FOO");
		expect(env.get("FOO")).toBe("bar");
		expect(process.env.FOO).toBe("bar");
	});

	it("fromValues carrega valores no construtor", () => {
		const env = new EnvHelper(makeCtx(), { fromValues: { CUSTOM: "hello" } });
		expect(env.get("CUSTOM")).toBe("hello");
	});

	it("get cai no process.env quando nao esta no state interno", () => {
		process.env.SYSTEM_VAR = "system-value";
		const env = new EnvHelper(makeCtx(), { fromValues: {} });
		expect(env.get("SYSTEM_VAR")).toBe("system-value");
		delete process.env.SYSTEM_VAR;
	});

	it("clear remove a chave do process.env e do state interno", () => {
		const env = new EnvHelper(makeCtx(), { fromValues: { FOO: "bar" } });
		env.clear("FOO");
		expect(env.get("FOO")).toBeUndefined();
		expect("FOO" in process.env).toBe(false);
	});

	it("restore deleta a chave quando ela nao existia no snapshot original", () => {
		delete process.env.NEW_KEY;
		const env = new EnvHelper(makeCtx());
		env.override("NEW_KEY", "v1");
		expect(process.env.NEW_KEY).toBe("v1");

		env.restore("NEW_KEY");
		expect("NEW_KEY" in process.env).toBe(false);
		expect(env.get("NEW_KEY")).toBeUndefined();
	});

	it("restoreAll remove chaves criadas apos o snapshot", () => {
		delete process.env.NEW_KEY;
		const env = new EnvHelper(makeCtx());
		env.override("NEW_KEY", "v1");

		env.restoreAll();
		expect("NEW_KEY" in process.env).toBe(false);
	});
});
