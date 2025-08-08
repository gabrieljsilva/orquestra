import {
	ContainerProvider,
	HelperProvider,
	IHttpServerAdapter,
	IIocContainer,
	IOrquestraContext,
	PluginProvider,
	ServiceProvider,
} from "../../types";

export class OrquestraContext implements IOrquestraContext {
	public readonly container: IIocContainer;
	public httpServer?: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>);
	public plugins: Array<PluginProvider> = [];
	public helpers: Array<HelperProvider> = [];
	public containers: Array<ContainerProvider> = [];
	public services: Array<ServiceProvider> = [];

	constructor(container: IIocContainer) {
		this.container = container;
	}

	registerHttpServer(httpServer: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>)): void {
		this.httpServer = httpServer;
	}

	registerContainers(containers: Array<ContainerProvider>): void {
		this.containers.push(...containers);
	}

	registerPlugins(plugins: Array<PluginProvider>): void {
		this.plugins.push(...plugins);

		for (const plugin of this.plugins) {
			this.container.register(plugin);
		}
	}

	registerHelpers(helpers: Array<HelperProvider>): void {
		this.helpers.push(...helpers);

		for (const helper of this.helpers) {
			this.container.register(helper);
		}
	}

	registerServices(services: Array<ServiceProvider>): void {
		this.services.push(...services);

		for (const service of this.services) {
			this.container.register(service);
		}
	}

	getHttpServer(): IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>) | undefined {
		return this.httpServer;
	}

	getPluginProviders(): Array<PluginProvider> {
		return this.plugins;
	}

	getHelperProviders(): Array<HelperProvider> {
		return this.helpers;
	}

	getContainerProviders(): Array<ContainerProvider> {
		return this.containers;
	}

	getServiceProviders(): Array<ServiceProvider> {
		return this.services;
	}
}
