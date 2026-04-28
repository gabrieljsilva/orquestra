import type { GlobalHookFn, GlobalOrquestraOptions, OrquestraConfig, WorkerOrquestraOptions } from "@orquestra/core";

function asArray(value: GlobalHookFn | GlobalHookFn[] | undefined): ReadonlyArray<GlobalHookFn> {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

export function configToGlobalOrquestraOptions(config: OrquestraConfig): GlobalOrquestraOptions {
	return {
		containers: config.global?.containers,
		env: config.env,
		logger: config.logger,
		beforeProvision: asArray(config.global?.beforeProvision),
		afterProvision: asArray(config.global?.afterProvision),
		beforeDeprovision: asArray(config.global?.beforeDeprovision),
		afterDeprovision: asArray(config.global?.afterDeprovision),
		hookTimeoutMs: config.serverHookTimeoutMs,
	};
}

export function configToWorkerOrquestraOptions(config: OrquestraConfig): WorkerOrquestraOptions {
	return {
		httpServer: config.worker?.httpServer,
		services: config.worker?.services,
		macros: config.worker?.macros,
		modules: config.worker?.modules,
		env: config.env,
		logger: config.logger,
		eachHookTimeoutMs: config.eachHookTimeoutMs,
		serverHookTimeoutMs: config.serverHookTimeoutMs,
	};
}
