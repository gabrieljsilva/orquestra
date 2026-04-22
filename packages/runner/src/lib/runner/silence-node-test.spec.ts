import { installNodeTestReporterFilter, uninstallNodeTestReporterFilter } from "./silence-node-test";

describe("installNodeTestReporterFilter", () => {
	let originalWrite: typeof process.stdout.write;
	let captured: string[];

	beforeEach(() => {
		captured = [];
		originalWrite = process.stdout.write;
		// Override BEFORE install so the filter wraps our spy.
		process.stdout.write = ((chunk: unknown): boolean => {
			const s = typeof chunk === "string" ? chunk : String(chunk);
			captured.push(s);
			return true;
		}) as typeof process.stdout.write;
	});

	afterEach(() => {
		uninstallNodeTestReporterFilter();
		process.stdout.write = originalWrite;
	});

	it("filtra linhas do reporter do node:test (com e sem ANSI)", () => {
		installNodeTestReporterFilter();

		process.stdout.write("✔ passed (1ms)\n");
		process.stdout.write("\x1b[32m✔ colored passed\x1b[39m\n");
		process.stdout.write("ℹ tests 5\n");
		process.stdout.write("✖ failed\n");

		expect(captured).toEqual([]);
	});

	it("permite que logs comuns do usuario passem", () => {
		installNodeTestReporterFilter();

		process.stdout.write("hello world\n");
		process.stdout.write("some log\n");

		expect(captured).toEqual(["hello world\n", "some log\n"]);
	});

	it("restaura o stdout.write original ao uninstall", () => {
		installNodeTestReporterFilter();
		process.stdout.write("✔ filtered\n");
		expect(captured).toEqual([]);

		uninstallNodeTestReporterFilter();
		process.stdout.write("✔ now visible\n");
		expect(captured).toEqual(["✔ now visible\n"]);
	});

	it("install e idempotente (nao empilha filtros)", () => {
		installNodeTestReporterFilter();
		installNodeTestReporterFilter();

		process.stdout.write("normal line\n");

		expect(captured).toEqual(["normal line\n"]);

		uninstallNodeTestReporterFilter();
		process.stdout.write("also normal\n");

		expect(captured).toEqual(["normal line\n", "also normal\n"]);
	});

	it("uninstall sem install e no-op", () => {
		expect(() => uninstallNodeTestReporterFilter()).not.toThrow();
	});
});
