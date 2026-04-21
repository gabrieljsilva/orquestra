import { OrquestraHttpServer } from "../adapters";
import { logger } from "../constants";
import { BootstrapManager } from "../internal/bootstrap-manager";
import { Injectable, IocContainer } from "../internal/ioc-container";
import { Logger } from "../internal/logger";
import { BddContainer } from "../internal/orquestra-bdd-container";
import { OrquestraContext } from "../internal/orquestra-context";
import { MacroRegistry } from "../internal/orquestra-macro";
import type { StepEvent } from "../types/events";
import { IOrquestraContext, OrquestraBootstrapOptions, OrquestraOptions } from "../types";
import type { FeatureDefinition } from "../types/bdd";
import type { FeatureMeta } from "../types/reporting";

export class Orquestra {
	private readonly bootstrapManager: BootstrapManager;
	private readonly context: IOrquestraContext;
	private readonly logger: Logger;
	private readonly bddContainer: BddContainer;
	private bootstrapOptions: OrquestraBootstrapOptions;

	constructor(options: OrquestraOptions) {
		this.logger = options.logger || logger;

		const container = new IocContainer(this.logger);
		this.context = new OrquestraContext(container);

		if (options.httpServer) {
			this.context.registerHttpServer(options.httpServer);
		}

		if (options.plugins) {
			this.context.registerPlugins(options.plugins);
		}

		if (options.helpers) {
			this.context.registerHelpers(options.helpers);
		}

		if (options.containers) {
			this.context.registerContainers(options.containers);
		}

		if (options.services) {
			this.context.registerServices(options.services);
		}

		if (options.macros) {
			this.context.registerMacros(options.macros);
		}

		this.bootstrapManager = new BootstrapManager(this.context, {
			env: options.env,
			logger: this.logger,
		});

		this.bddContainer = new BddContainer();

		const macroRegistry = new MacroRegistry(this.context);
		this.context.container.register({ provide: MacroRegistry, useValue: macroRegistry } as any);
		this.bddContainer.setMacroRegistry(macroRegistry);
	}

	feature(name: string, definition: FeatureDefinition) {
		return this.bddContainer.define(name, definition);
	}

	async start(options?: OrquestraBootstrapOptions) {
		if (options) {
			this.bootstrapOptions = options;
		}

		await this.bootstrapManager.start(this.bootstrapOptions);
	}

	async teardown() {
		await this.bootstrapManager.teardown(this.bootstrapOptions);
	}

	async provision() {
		await this.bootstrapManager.provision();
	}

	async deprovision() {
		await this.bootstrapManager.deprovision();
	}

	getEvents(): StepEvent[] {
		return this.bddContainer.getEvents();
	}

	getFeatureMeta(): FeatureMeta[] {
		return this.bddContainer.getFeatureMeta();
	}

	getBddContainer(): BddContainer {
		return this.bddContainer;
	}

	get http() {
		const client = this.context.container.get<OrquestraHttpServer>(OrquestraHttpServer);
		return client.createClient();
	}

	get<T extends Injectable>(token: string | Function | Symbol): T {
		const instance = this.context.container.get<T>(token);
		if (!instance) {
			throw new Error(`Service not found for token: ${String(token)}`);
		}
		return instance;
	}
}
