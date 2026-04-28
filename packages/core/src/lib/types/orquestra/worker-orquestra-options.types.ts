import type { LoadEnvOptions } from "../../helpers/env";
import type { Logger } from "../../internal/logger";
import type { ServiceProvider } from "../components";
import type { MacroDefinition, ModuleDefinition } from "../define";
import type { IHttpServerAdapter } from "../http-server";

export interface WorkerOrquestraOptions {
	httpServer?: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>);
	services?: ReadonlyArray<ServiceProvider>;
	macros?: ReadonlyArray<MacroDefinition<any, any>>;
	modules?: ReadonlyArray<ModuleDefinition>;
	env?: LoadEnvOptions;
	logger?: Logger;
	/**
	 * Time budget (ms) for each-scope hooks (`beforeEachScenario`,
	 * `afterEachScenario`, `beforeEachFeature`, `afterEachFeature`). Each-hooks
	 * are kept tight because they run between every scenario.
	 */
	eachHookTimeoutMs?: number;
	/**
	 * Time budget (ms) for server-lifecycle hooks (`beforeStartServer`,
	 * `afterStartServer`, `beforeStopServer`). These can legitimately do heavy
	 * work — boot containers, run migrations — so the budget is more generous.
	 */
	serverHookTimeoutMs?: number;
}
