import type { OrquestraConfig } from "@orquestra/core";
import { configToGlobalOrquestraOptions, configToWorkerOrquestraOptions } from "./config-mapper";

describe("configToGlobalOrquestraOptions", () => {
	it("normalizes a single global hook function into a one-element array", () => {
		const fn = async () => {};
		const opts = configToGlobalOrquestraOptions({
			global: { afterProvision: fn },
		} as OrquestraConfig);

		expect(opts.afterProvision).toEqual([fn]);
	});

	it("preserves an array of hooks as-is", () => {
		const a = async () => {};
		const b = async () => {};
		const opts = configToGlobalOrquestraOptions({
			global: { beforeDeprovision: [a, b] },
		} as OrquestraConfig);

		expect(opts.beforeDeprovision).toEqual([a, b]);
	});

	it("returns an empty array when a hook is not configured (downstream code can iterate without guards)", () => {
		const opts = configToGlobalOrquestraOptions({} as OrquestraConfig);
		expect(opts.beforeProvision).toEqual([]);
		expect(opts.afterProvision).toEqual([]);
		expect(opts.beforeDeprovision).toEqual([]);
		expect(opts.afterDeprovision).toEqual([]);
	});

	it("propagates serverHookTimeoutMs as the global hookTimeoutMs (single budget for the main process)", () => {
		const opts = configToGlobalOrquestraOptions({
			serverHookTimeoutMs: 90_000,
		} as OrquestraConfig);
		expect(opts.hookTimeoutMs).toBe(90_000);
	});

	it("forwards containers, env and logger from the global block", () => {
		const containers = [] as any;
		const envOpts = { fromPath: "/.env" } as any;
		const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {} } as any;

		const opts = configToGlobalOrquestraOptions({
			global: { containers },
			env: envOpts,
			logger,
		} as OrquestraConfig);

		expect(opts.containers).toBe(containers);
		expect(opts.env).toBe(envOpts);
		expect(opts.logger).toBe(logger);
	});
});

describe("configToWorkerOrquestraOptions", () => {
	it("maps eachHookTimeoutMs and serverHookTimeoutMs (separated, not the legacy single `timeout`)", () => {
		const opts = configToWorkerOrquestraOptions({
			eachHookTimeoutMs: 7_000,
			serverHookTimeoutMs: 45_000,
		} as OrquestraConfig);

		expect(opts.eachHookTimeoutMs).toBe(7_000);
		expect(opts.serverHookTimeoutMs).toBe(45_000);
	});

	it("forwards worker.httpServer / services / macros / modules transparently", () => {
		const httpServer = (() => {}) as any;
		const services = [] as any;
		const macros = [] as any;
		const modules = [] as any;

		const opts = configToWorkerOrquestraOptions({
			worker: { httpServer, services, macros, modules },
		} as OrquestraConfig);

		expect(opts.httpServer).toBe(httpServer);
		expect(opts.services).toBe(services);
		expect(opts.macros).toBe(macros);
		expect(opts.modules).toBe(modules);
	});

	it("missing worker block: every worker-scope option is undefined (worker bootstraps with defaults)", () => {
		const opts = configToWorkerOrquestraOptions({} as OrquestraConfig);
		expect(opts.httpServer).toBeUndefined();
		expect(opts.services).toBeUndefined();
		expect(opts.eachHookTimeoutMs).toBeUndefined();
	});
});
