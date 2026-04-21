import type { OrquestraConfig, OrquestraOptions } from "@orquestra/core";

export function configToOrquestraOptions(config: OrquestraConfig): OrquestraOptions {
	if (config.global || config.worker) {
		return {
			containers: config.global?.containers,
			httpServer: config.worker?.httpServer,
			plugins: config.worker?.plugins,
			helpers: config.worker?.helpers,
			services: config.worker?.services,
			macros: config.worker?.macros,
			env: config.env,
			logger: config.logger,
		};
	}

	return {
		httpServer: config.httpServer,
		plugins: config.plugins,
		helpers: config.helpers,
		containers: config.containers,
		services: config.services,
		macros: config.macros,
		env: config.env,
		logger: config.logger,
	};
}

export function configToGlobalOptions(config: OrquestraConfig): OrquestraOptions {
	if (config.global || config.worker) {
		return {
			containers: config.global?.containers,
			env: config.env,
			logger: config.logger,
		};
	}

	return {
		containers: config.containers,
		env: config.env,
		logger: config.logger,
	};
}

export function configToWorkerOptions(config: OrquestraConfig): OrquestraOptions {
	if (config.global || config.worker) {
		return {
			httpServer: config.worker?.httpServer,
			plugins: config.worker?.plugins,
			helpers: config.worker?.helpers,
			services: config.worker?.services,
			macros: config.worker?.macros,
			env: config.env,
			logger: config.logger,
		};
	}

	return {
		httpServer: config.httpServer,
		plugins: config.plugins,
		helpers: config.helpers,
		services: config.services,
		macros: config.macros,
		env: config.env,
		logger: config.logger,
	};
}
