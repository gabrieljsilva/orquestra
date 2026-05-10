import type { LoadEnvOptions } from "../../helpers/env";
import type { Logger } from "../../internal/logger";
import type { OrquestraReporter } from "../../internal/reporting/orquestra-reporter";
import type { ContainerProvider, ServiceProvider } from "../components";
import type { MacroDefinition, ModuleDefinition } from "../define";
import type { IHttpServerAdapter } from "../http-server";
import type { GlobalHookFn } from "../lifecycle/hook.types";

export interface OrquestraGlobalConfig {
	containers?: Array<ContainerProvider>;
	/**
	 * Run before testcontainers are provisioned. Useful for env validation or
	 * generating dynamic env vars consumed by container providers.
	 *
	 * Runs in the **main process** — there is no HTTP server here (each worker
	 * boots its own). `ctx.container` only sees the global IoC (containers),
	 * not worker-scoped services.
	 */
	beforeProvision?: GlobalHookFn | GlobalHookFn[];
	/**
	 * Run after testcontainers are up and **before** any worker is forked.
	 * Right place for one-time global setup: create a Postgres template
	 * database with migrations + seeds, import a Keycloak realm, populate
	 * Redis fixtures.
	 *
	 * Runs in the **main process** — no HTTP server, no worker services. Use
	 * `ctx.container.get(Postgres)` etc. to talk to the global containers.
	 */
	afterProvision?: GlobalHookFn | GlobalHookFn[];
	/**
	 * Run after every worker has finished, **before** containers are torn
	 * down. Use for collecting dumps, publishing partial state for debugging.
	 */
	beforeDeprovision?: GlobalHookFn | GlobalHookFn[];
	/**
	 * Run after containers are gone. Use for posting artifacts / notifying CI.
	 * No `ctx.container` access here — the global IoC has already torn down.
	 */
	afterDeprovision?: GlobalHookFn | GlobalHookFn[];
}

export interface OrquestraWorkerConfig {
	httpServer?: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>);
	services?: Array<ServiceProvider>;
	macros?: Array<MacroDefinition<any, any>>;
	modules?: Array<ModuleDefinition>;
}

export interface OrquestraConfig {
	global?: OrquestraGlobalConfig;
	worker?: OrquestraWorkerConfig;

	env?: LoadEnvOptions;

	reporter?: OrquestraReporter;
	reporters?: OrquestraReporter[];
	testMatch?: string[];
	concurrency?: number;

	/**
	 * Default time budget (ms) for each scenario body. Features and scenarios
	 * may override it. Default: 5000.
	 */
	scenarioTimeoutMs?: number;

	/**
	 * Time budget (ms) for each-scope hooks (`beforeEachScenario`,
	 * `afterEachScenario`, `beforeEachFeature`, `afterEachFeature`). Default: 10000.
	 */
	eachHookTimeoutMs?: number;

	/**
	 * Time budget (ms) for server-lifecycle hooks (`beforeStartServer`,
	 * `afterStartServer`, `beforeStopServer`) and for service onStart/onTeardown.
	 * Default: 60000.
	 */
	serverHookTimeoutMs?: number;

	/**
	 * Soft memory limit (MB) per worker. After finishing a feature, a worker
	 * whose heapUsed exceeds this is asked to drain and exit; the manager
	 * spawns a fresh worker to continue the queue. Undefined disables recycling.
	 */
	workerMemoryLimitMb?: number;

	/**
	 * When `true`, each worker installs an `async_hooks` tracker and reports
	 * async resources (timers, sockets, watchers, file descriptors) that were
	 * created during a feature and still kept the event loop alive when the
	 * feature finished. Reports are written to stderr and serialized into the
	 * `artifact.json` (per feature + summary aggregates).
	 *
	 * Diagnostic only — never fails the run. Cost is real (`async_hooks`
	 * captures stack traces); leave off for normal runs and turn on while
	 * investigating leaks. Overridden by the CLI flag `--detect-open-handles`
	 * / `--no-detect-open-handles`.
	 */
	detectOpenHandles?: boolean;

	spec?: string;

	outputDir?: string;

	/**
	 * Maximum size in bytes for an attachment to be embedded inline in
	 * `artifact.json`. Larger payloads (and any binary attachment) are
	 * spilled to `outputDir/attachments/<scenarioId>/...` and referenced by
	 * relative path. Default: 51200 (50KB).
	 */
	inlineThresholdBytes?: number;

	logger?: Logger;
}
