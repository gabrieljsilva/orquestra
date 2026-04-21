import type { LoadEnvOptions } from "../../helpers/env";
import type { Logger } from "../../internal/logger";
import type { OrquestraReporter } from "../../internal/reporting/orquestra-reporter";
import type {
	ContainerProvider,
	HelperProvider,
	MacroProvider,
	PluginProvider,
	ServiceProvider,
} from "../components";
import type { IHttpServerAdapter } from "../http-server";

export interface OrquestraGlobalConfig {
	containers?: Array<ContainerProvider>;
}

export interface OrquestraWorkerConfig {
	httpServer?: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>);
	plugins?: Array<PluginProvider>;
	helpers?: Array<HelperProvider>;
	services?: Array<ServiceProvider>;
	macros?: Array<MacroProvider>;
}

export interface OrquestraConfig {
	global?: OrquestraGlobalConfig;
	worker?: OrquestraWorkerConfig;

	httpServer?: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>);
	plugins?: Array<PluginProvider>;
	helpers?: Array<HelperProvider>;
	containers?: Array<ContainerProvider>;
	services?: Array<ServiceProvider>;
	macros?: Array<MacroProvider>;

	env?: LoadEnvOptions;

	reporter?: OrquestraReporter;
	reporters?: OrquestraReporter[];
	testMatch?: string[];
	concurrency?: number;
	timeout?: number;

	spec?: string;

	outputDir?: string;

	logger?: Logger;
}
