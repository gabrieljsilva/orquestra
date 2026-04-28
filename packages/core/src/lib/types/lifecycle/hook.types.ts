import type { OrquestraHttpServer } from "../../adapters";
import type { EnvHelper } from "../../helpers/env";
import type { Injectable } from "../../internal/ioc-container";
import type { ClassConstructor, IIocContainer } from "../ioc";

export type HookKind =
	| "beforeStartServer"
	| "afterStartServer"
	| "beforeEachFeature"
	| "afterEachFeature"
	| "beforeEachScenario"
	| "afterEachScenario"
	| "beforeStopServer";

/**
 * Context passed to lifecycle hooks.
 *
 * Note that `ctx.http` is the underlying `OrquestraHttpServer` (the abstraction
 * used to register pre-request hooks, swap close handlers, etc.) — NOT the
 * SuperTest agent returned by the public `orquestra.http` getter. The intent is
 * that hooks configure the server (e.g. `ctx.http.addPreRequestHook(...)`),
 * while scenarios consume it as a request agent via `orquestra.http`.
 *
 * `ctx.http` is unavailable inside `beforeStartServer` (the server has not
 * started yet) — accessing it there throws.
 */
export interface HookContext {
	env: EnvHelper;
	http: OrquestraHttpServer;
	get<T extends Injectable>(token: ClassConstructor<T>): T;
	get<T extends Injectable>(token: string | Symbol): T;
	container: IIocContainer;
}

export type HookFn = (ctx: HookContext) => void | Promise<void>;

/**
 * Kinds of global hooks. They run in the **main process**, not inside workers,
 * so they have no access to the worker-scoped HTTP server. See
 * {@link GlobalHookContext}.
 */
export type GlobalHookKind = "beforeProvision" | "afterProvision" | "beforeDeprovision" | "afterDeprovision";

/**
 * Context passed to global hooks. Mirror of {@link HookContext} **without**
 * `http` — the main process never owns an HTTP server (each worker boots its
 * own). Use this hook to:
 *  - run one-time setup against the shared infra (postgres template DB,
 *    keycloak realm import, redis seed),
 *  - validate environment / generate dynamic env vars,
 *  - publish results / collect dumps after deprovision.
 *
 * `ctx.container` resolves to the **global** IoC — it sees containers
 * (`Postgres`, `RabbitMQ`, ...) declared in `global.containers`, not the
 * worker-scoped `services` / `macros`.
 */
export interface GlobalHookContext {
	env: EnvHelper;
	get<T extends Injectable>(token: ClassConstructor<T>): T;
	get<T extends Injectable>(token: string | Symbol): T;
	container: IIocContainer;
}

export type GlobalHookFn = (ctx: GlobalHookContext) => void | Promise<void>;

/**
 * Recorded when a lifecycle hook fails. `feature`/`scenario` are populated by
 * the artifact generator when the failure originates from a scenario-scoped
 * hook (`beforeEach`/`afterEach`); file-scoped hooks leave them undefined and
 * the failure is associated with the file in the IPC layer instead.
 */
export interface HookFailure {
	hookName: HookKind;
	feature?: string;
	scenario?: string;
	error: { message: string; stack?: string };
	durationMs?: number;
}
