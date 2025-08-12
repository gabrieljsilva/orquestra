import { StartedTestContainer } from "testcontainers";
import { OrquestraHttpServer } from "../../adapters";
import { httpServerFactory } from "../../constants";
import { EnvHelper } from "../../helpers/env";
import {
	BootstrapManagerOptions,
	ClassConstructor,
	ContainerProvider,
	IHttpServerAdapter,
	OrquestraBootstrapOptions,
	Provider,
} from "../../types";
import { IOrquestraContext } from "../../types";
import { Injectable } from "../ioc-container";
import { Logger } from "../logger";
import { OrquestraContainer } from "../orquestra-container";

export class BootstrapManager {
	private readonly context: IOrquestraContext;
	private readonly logger: Logger;

	constructor(context: IOrquestraContext, options?: BootstrapManagerOptions) {
		this.context = context;
		this.logger = options?.logger;

		const httpServer = this.context.getHttpServer();
		if (httpServer) {
			if (typeof httpServer === "function") {
				this.context.container.register({
					provide: httpServerFactory,
					useValue: httpServer,
				});
			} else {
				this.registerHttpServer(httpServer);
			}
		}

		this.context.container.register({
			provide: EnvHelper,
			useValue: new EnvHelper(context, options?.env),
		});

		this.registerHelpers();
		this.registerContainers();
		this.registerPlugins();
		this.registerServices();
	}

	registerHttpServer(adapter: IHttpServerAdapter) {
		const httpServer = new OrquestraHttpServer(this.context, adapter);
		this.context.container.register({
			provide: OrquestraHttpServer,
			useValue: httpServer,
		});
	}
	registerContainers() {
		const containers = this.context.getContainerProviders();
		if (!containers?.length) {
			return;
		}

		const registeredTokens = new Set<any>();

		const register = (provider: ContainerProvider) => {
			let providerToRegister: ClassConstructor<any> | Provider<any>;
			let token: any;
			let dependencies: ContainerProvider[] | undefined;

			if (typeof provider === "function") {
				providerToRegister = provider;
				token = provider;
			} else if ("container" in provider) {
				providerToRegister = provider.container;
				dependencies = provider.dependsOn;
				token = typeof provider.container === "function" ? provider.container : provider.container.provide;
			} else {
				providerToRegister = provider;
				token = provider.provide;
			}

			dependencies?.forEach(register);

			if (!registeredTokens.has(token)) {
				this.context.container.register(providerToRegister);
				registeredTokens.add(token);
			}
		};

		containers.forEach(register);
	}

	registerHelpers() {
		const helpers = this.context.getHelperProviders();
		for (const helper of helpers) {
			this.context.container.register(helper);
		}
	}

	registerPlugins() {
		const plugins = this.context.getPluginProviders();
		for (const plugin of plugins) {
			this.context.container.register(plugin);
		}
	}

	registerServices() {
		const services = this.context.getServiceProviders();
		for (const service of services) {
			this.context.container.register(service);
		}
	}

	async provision() {
		this.logger.info("Provisioning Orquestra Infra");

		const startedAt = Date.now();
		await this.startHelpers();
		await this.startContainers();
		await this.startPlugins();
		await this.startServices();
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`Orquestra Infra Provisioned in ${timeTaken}ms`);
	}

	async deprovision() {
		this.logger.info("Deprovisioning Orquestra Infra");

		const startedAt = Date.now();
		await this.teardownServices();
		await this.teardownPlugins();
		await this.teardownContainers();
		await this.teardownHelpers();
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`Orquestra Infra Deprovisioned in ${timeTaken}ms`);
	}

	async start(options?: OrquestraBootstrapOptions) {
		this.logger.info("Starting Orquestra");
		const startedAt = Date.now();

		await this.startHelpers();

		if (!options?.skipContainers) {
			await this.startContainers();
		}

		await this.startHttpServer();
		await this.startPlugins();
		await this.startServices();

		const timeTaken = Date.now() - startedAt;
		this.logger.info(`Orquestra started in ${timeTaken}ms`);
	}

	async teardown(options?: OrquestraBootstrapOptions) {
		this.logger.info("tearing down");
		const startedAt = Date.now();

		await this.teardownServices();
		await this.teardownPlugins();
		await this.teardownHttpServer();

		if (!options?.skipContainers) {
			await this.teardownContainers();
		}

		await this.teardownHelpers();

		const timeTaken = Date.now() - startedAt;
		this.logger.info(`tearing down complete in ${timeTaken}ms`);
	}

	private async startHelpers() {
		await this.context.container.resolve(this.context, EnvHelper);

		this.logger.info("starting helpers");
		const startedAt = Date.now();
		const helpers = this.context.getHelperProviders();
		for (const helper of helpers) {
			const token = typeof helper === "function" ? helper : helper.provide;
			const helperInstance = await this.context.container.resolve(this.context, token);
			await helperInstance?.onStart?.();
		}
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`helpers started in ${timeTaken}ms`);
	}

	private getContainerToken(containerProvider: any): any {
		if (typeof containerProvider !== "function") {
			if ("container" in containerProvider) {
				const container = containerProvider.container;
				return typeof container === "function" ? container : container.provide;
			}
			return containerProvider.provide;
		}
		return containerProvider;
	}

	private buildDependencyGraph(): Map<any, Set<any>> {
		const graph = new Map<any, Set<any>>();
		const containers = this.context.getContainerProviders();

		for (const containerProvider of containers) {
			const token = this.getContainerToken(containerProvider);
			graph.set(token, new Set());
		}

		for (const containerProvider of containers) {
			if (typeof containerProvider !== "function" && "container" in containerProvider && containerProvider.dependsOn) {
				const token = this.getContainerToken(containerProvider);
				for (const dependency of containerProvider.dependsOn) {
					const dependencyToken = this.getContainerToken(dependency);
					graph.get(token).add(dependencyToken);
				}
			}
		}

		return graph;
	}

	private async startContainers() {
		this.logger.info("Starting containers");
		const startedAt = Date.now();
		const graph = this.buildDependencyGraph();
		const started = new Set<any>();
		const starting = new Set<any>();

		const startContainer = async (token: any) => {
			if (started.has(token)) {
				return;
			}

			if (starting.has(token)) {
				throw new Error(`Circular dependency detected for container: ${token}`);
			}

			starting.add(token);

			const dependencies = graph.get(token) || new Set();
			await Promise.all(Array.from(dependencies).map((dep) => startContainer(dep)));

			const container = await this.context.container.resolve<OrquestraContainer<StartedTestContainer>>(
				this.context,
				token,
			);
			this.logger.info(`Starting container: ${container.containerName}`);
			await container.start();
			this.logger.info(`Container started: ${container.containerName}`);

			started.add(token);
			starting.delete(token);
		};

		await Promise.all(Array.from(graph.keys()).map((token) => startContainer(token)));

		const timeTaken = Date.now() - startedAt;
		this.logger.info(`Containers started in ${timeTaken}ms`);
	}

	private async startHttpServer() {
		this.logger.info("Starting HTTP server");
		const startedAt = Date.now();

		const adapterFactory =
			this.context.container.get<() => IHttpServerAdapter<any> | Promise<IHttpServerAdapter<any>>>(httpServerFactory);
		if (adapterFactory) {
			const adapter = await adapterFactory();
			this.registerHttpServer(adapter);
		}

		if (!this.context.container.get(OrquestraHttpServer)) {
			this.logger.info("No HTTP server found - skipping");
			return;
		}

		await this.context.container.resolve<OrquestraHttpServer>(this.context, OrquestraHttpServer);
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`HTTP server started in ${timeTaken}ms`);
	}

	private async startPlugins() {
		this.logger.info("Starting plugins");
		const startedAt = Date.now();
		const plugins = this.context.getPluginProviders();
		for (const plugin of plugins) {
			const token = typeof plugin === "function" ? plugin : plugin.provide;
			const pluginInstance = await this.context.container.resolve<Injectable>(this.context, token);
			await pluginInstance?.onStart?.();
		}
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`Plugins started in ${timeTaken}ms`);
	}

	private async teardownPlugins() {
		this.logger.info("tearing down plugins");
		const startedAt = Date.now();
		const plugins = this.context.getPluginProviders();
		for (const plugin of plugins) {
			const token = typeof plugin === "function" ? plugin : plugin.provide;
			const instance = await this.context.container.resolve(this.context, token);
			await instance?.onTeardown?.();
		}
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`plugins stopped in ${timeTaken}ms`);
	}

	private async teardownHttpServer() {
		try {
			const httpServer = this.context.container.get<OrquestraHttpServer>(OrquestraHttpServer);
			if (httpServer) {
				this.logger.info("Closing HTTP server");
				const startedAt = Date.now();
				await httpServer.close();
				const timeTaken = Date.now() - startedAt;
				this.logger.info(`HTTP server closed in ${timeTaken}ms`);
			}
		} catch (error) {
			this.logger.error(`Error closing HTTP server: ${error}`);
		}
	}

	private async teardownHelpers() {
		this.logger.info("tearing down helpers");
		const startedAt = Date.now();
		const helpers = this.context.getHelperProviders();
		for (const helper of helpers) {
			const token = typeof helper === "function" ? helper : helper.provide;
			const instance = await this.context.container.resolve(this.context, token);
			await instance?.onTeardown?.();
		}
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`helpers stopped in ${timeTaken}ms`);
	}

	private async teardownContainers() {
		this.logger.info("tearing down containers");
		const startedAt = Date.now();
		const containerTokens = new Set<any>();
		const containers = this.context.getContainerProviders();
		for (const containerProvider of containers) {
			const registerContainer = (provider: ContainerProvider) => {
				const token = this.getContainerToken(provider);
				containerTokens.add(token);

				if (typeof provider !== "function" && "container" in provider && provider.dependsOn) {
					for (const dependency of provider.dependsOn) {
						registerContainer(dependency);
					}
				}
			};

			registerContainer(containerProvider);
		}

		const stoppedContainers = new Set<any>();

		const graph = this.buildDependencyGraph();

		const dependentsMap = new Map<any, Set<any>>();
		for (const token of containerTokens) {
			dependentsMap.set(token, new Set());
		}

		for (const [container, dependencies] of graph.entries()) {
			for (const dependency of dependencies) {
				if (!dependentsMap.has(dependency)) {
					dependentsMap.set(dependency, new Set());
				}
				dependentsMap.get(dependency).add(container);
			}
		}

		const stopContainers = async () => {
			const containersToStop = Array.from(containerTokens).filter((token) => {
				if (stoppedContainers.has(token)) {
					return false;
				}

				const dependents = dependentsMap.get(token) || new Set();
				return Array.from(dependents).every((dep) => stoppedContainers.has(dep));
			});

			if (containersToStop.length === 0) {
				if (stoppedContainers.size < containerTokens.size) {
					const remaining = Array.from(containerTokens).filter((token) => !stoppedContainers.has(token));
					this.logger.warn(`Possible circular dependency detected. Stopping remaining containers: ${remaining.join(", ")}`);

					await Promise.all(
						remaining.map(async (token) => {
							try {
								const container = await this.context.container.resolve<OrquestraContainer<StartedTestContainer>>(
									this.context,
									token,
								);
								this.logger.info(`Stopping container: ${container.containerName}`);
								await container.stop();
								this.logger.info(`Container stopped: ${container.containerName}`);
								stoppedContainers.add(token);
							} catch (error) {
								this.logger.error(`Error stopping container: ${error}`);
								stoppedContainers.add(token); // Mark as stopped even if there was an error
							}
						}),
					);
				}
				return;
			}

			await Promise.all(
				containersToStop.map(async (token) => {
					try {
						const container = await this.context.container.resolve<OrquestraContainer<StartedTestContainer>>(
							this.context,
							token,
						);
						this.logger.info(`Stopping container: ${container.containerName}`);
						await container.stop();
						this.logger.info(`Container stopped: ${container.containerName}`);
						stoppedContainers.add(token);
					} catch (error) {
						this.logger.error(`Error stopping container: ${error}`);
						stoppedContainers.add(token);
					}
				}),
			);

			if (stoppedContainers.size < containerTokens.size) {
				await stopContainers();
			}
		};

		await stopContainers();
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`containers stopped in ${timeTaken}ms`);
	}

	async startServices() {
		this.logger.info("starting services");
		const startedAt = Date.now();

		const services = this.context.getServiceProviders();
		for (const service of services) {
			const token = typeof service === "function" ? service : service.provide;
			const instance = await this.context.container.resolve(this.context, token);
			instance?.onStart?.();
		}
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`services started in ${timeTaken}ms`);
	}

	async teardownServices() {
		this.logger.info("tearing down services");
		const startedAt = Date.now();

		const services = this.context.getServiceProviders();
		for (const service of services) {
			const token = typeof service === "function" ? service : service.provide;
			const instance = await this.context.container.resolve(this.context, token);
			instance?.onTeardown?.();
		}
		const timeTaken = Date.now() - startedAt;
		this.logger.info(`services stopped in ${timeTaken}ms`);
	}
}
