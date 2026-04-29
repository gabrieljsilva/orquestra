import { afterEach } from "vitest";
import { _resetConfigured, configure } from "./configure";

afterEach(() => {
	// Each test starts with a fresh singleton.
	try {
		_resetConfigured();
	} catch {
		// already reset; ignore.
	}
});

describe("configure", () => {
	it("initializes the WorkerOrquestra singleton with the given options", () => {
		expect(() => configure({})).not.toThrow();
	});

	it("rejects a second configure() call in the same file", () => {
		configure({});
		expect(() => configure({})).toThrow(/called more than once/);
	});

	it("rejects an httpServer field — bridge is for unit/integration, not E2E", () => {
		expect(() =>
			configure({
				// @ts-expect-error — explicitly forbidden by ConfigureOptions
				httpServer: {} as any,
			}),
		).toThrow(/httpServer is not supported/);
	});

	it("after _resetConfigured, configure() can be called again", () => {
		configure({});
		_resetConfigured();
		expect(() => configure({})).not.toThrow();
	});
});
