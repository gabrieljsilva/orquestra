import { LoadEnvOptions } from "../../helpers/env";
import { Logger } from "../../internal/logger";
import { ContainerProvider, HelperProvider, MacroProvider, PluginProvider, ServiceProvider } from "../components";
import { IHttpServerAdapter } from "../http-server";
import { IIocContainer } from "../ioc";

export interface IOrquestraContext {
	container: IIocContainer;

	// Injectable components
	httpServer?: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>);
	plugins: Array<PluginProvider>;
	helpers: Array<HelperProvider>;
	containers: Array<ContainerProvider>;
	services: Array<ServiceProvider>;
	macros: Array<MacroProvider>;

	// Registration methods
	registerHttpServer(httpServer: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>)): void;
	registerPlugins(plugins: Array<PluginProvider>): void;
	registerHelpers(helpers: Array<HelperProvider>): void;
	registerContainers(containers: Array<ContainerProvider>): void;
	registerServices(services: Array<ServiceProvider>): void;
	registerMacros(macros: Array<MacroProvider>): void;

	// Getter methods
	getHttpServer(): IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>) | undefined;
	getPluginProviders(): Array<PluginProvider>;
	getHelperProviders(): Array<HelperProvider>;
	getContainerProviders(): Array<ContainerProvider>;
	getServiceProviders(): Array<ServiceProvider>;
	getMacroProviders(): Array<MacroProvider>;
}

export interface OrquestraOptions {
	httpServer?: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>);
	plugins?: Array<PluginProvider>;
	helpers?: Array<HelperProvider>;
	containers?: Array<ContainerProvider>;
	services?: Array<ServiceProvider>;
	macros?: Array<MacroProvider>;
	env?: LoadEnvOptions;
	logger?: Logger;
}

export interface OrquestraBootstrapOptions {
	skipContainers?: boolean;
}
