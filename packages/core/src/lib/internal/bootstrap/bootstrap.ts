import { OrquestraHttpServer } from "../../adapters";
import { httpServerFactory } from "../../constants";
import { EnvHelper } from "../../helpers/env";
import type { IHttpServerAdapter, IOrquestraContext } from "../../types";
import type { LoadEnvOptions } from "../../helpers/env";
import type { ContainerProvider, ServiceProvider } from "../../types/components";
import type { MacroDefinition, ModuleDefinition } from "../../types/define";
import type { HookFn, HookKind } from "../../types/lifecycle/hook.types";
import type { IocContainer } from "../ioc-container";
import type { Logger } from "../logger";
import { ComponentLifecycle } from "./component-lifecycle";
import { flattenModules } from "./module-flattener";

export interface BootstrapResolveInput {
	httpServer?: IHttpServerAdapter | (() => IHttpServerAdapter | Promise<IHttpServerAdapter>);
	services?: ReadonlyArray<ServiceProvider>;
	macros?: ReadonlyArray<MacroDefinition<any, any>>;
	containers?: ReadonlyArray<ContainerProvider>;
	modules?: ReadonlyArray<ModuleDefinition>;
	env?: LoadEnvOptions;
	/**
	 * Per-call timeout (ms) applied to onStart and onTeardown of services.
	 * Falsy/undefined disables the timeout — used by the global Bootstrap
	 * since container provisioning has its own pacing (Docker pulls etc.).
	 */
	componentTimeoutMs?: number;
}

export interface ResolvedHooks {
	get(kind: HookKind): ReadonlyArray<HookFn>;
}

/**
 * Orchestrates the three-phase deterministic lifecycle of a worker-scoped or
 * global-scoped Orquestra instance.
 *
 *  - Phase 1 (resolve, sync): registers providers in the IoC, instantiates
 *    services and macros, populates the macro registry and the hook map.
 *  - Phase 2 (boot, async): http server listens, services/macros run onStart.
 *  - Phase 3 (teardown, async): mirror of boot.
 *
 * Containers are handled by `provision`/`deprovision` (used by the global
 * orchestrator only — workers reuse env vars from the global parent).
 */
export class Bootstrap {
	private readonly context: IOrquestraContext;
	private readonly logger: Logger;

	private serviceTokens: unknown[] = [];
	private containerTokens: unknown[] = [];
	private containerDependencies = new Map<unknown, unknown[]>();
	private containerStartupMs: Array<{ name: string; startupMs: number }> = [];
	private macros: MacroDefinition<any, any>[] = [];
	private hooksByKind: Map<HookKind, HookFn[]> = new Map();

	private servicesLifecycle?: ComponentLifecycle;

	private resolved = false;
	private booted = false;

	constructor(context: IOrquestraContext, logger: Logger) {
		this.context = context;
		this.logger = logger;
	}

	resolve(input: BootstrapResolveInput): void {
		if (this.resolved) {
			throw new Error("Bootstrap.resolve() may only be called once");
		}

		this.context.container.register({
			provide: EnvHelper,
			useValue: new EnvHelper(this.context, input.env),
		});

		if (input.httpServer) {
			if (typeof input.httpServer === "function") {
				this.context.container.register({
					provide: httpServerFactory,
					useValue: input.httpServer,
				});
			} else {
				this.registerHttpServer(input.httpServer);
			}
		}

		const flat = flattenModules(input.modules ?? []);
		const allServices = [...(input.services ?? []), ...flat.services];
		const allContainers = [...(input.containers ?? []), ...flat.containers];
		const allMacros = [...(input.macros ?? []), ...flat.macros];

		const ioc = this.context.container as IocContainer;
		const seenServiceTokens = new Set<unknown>();
		const eagerInstances: Array<{ token: unknown; instance: any }> = [];

		try {
			for (const service of allServices) {
				const token = typeof service === "function" ? service : service.provide;
				if (seenServiceTokens.has(token)) {
					// Same provider exported by multiple modules — register/lifecycle
					// once. Without dedup, onStart/onTeardown would run N times.
					continue;
				}
				seenServiceTokens.add(token);

				this.context.container.register(service);
				this.serviceTokens.push(token);

				// Eager-instantiate classes so hooks can resolve them via ctx.get
				// before the boot phase. Async factory providers are deferred to
				// the bootstrap.boot() resolve loop.
				const eager = this.instantiateSync(service);
				if (eager !== undefined) {
					ioc.setInstance(token as any, eager);
					eagerInstances.push({ token, instance: eager });
				}
			}
		} catch (err) {
			// A constructor threw mid-resolve. Anything already instantiated may
			// hold open handles (timers, sockets, file descriptors) — give it a
			// chance to clean up before the failure propagates.
			for (const { instance } of [...eagerInstances].reverse()) {
				try {
					if (instance && typeof instance.onTeardown === "function") {
						const result = instance.onTeardown();
						if (result && typeof (result as Promise<void>).then === "function") {
							// fire-and-forget: resolve() is sync; we can't await
							(result as Promise<void>).catch((teardownErr) => {
								this.logger.error(`error tearing down ${String(instance?.constructor?.name)}: ${teardownErr}`);
							});
						}
					}
				} catch (teardownErr) {
					this.logger.error(`error tearing down ${String(instance?.constructor?.name)}: ${teardownErr}`);
				}
			}
			throw err;
		}

		this.collectContainers(allContainers);

		const seenMacroTokens = new Set<unknown>();
		for (const macro of allMacros) {
			if (seenMacroTokens.has(macro.__token)) continue;
			seenMacroTokens.add(macro.__token);
			this.context.container.register({
				provide: macro.__token,
				useValue: macro,
			});
			this.macros.push(macro);
		}

		this.hooksByKind = flat.hooks;

		this.servicesLifecycle = new ComponentLifecycle({
			label: "services",
			tokens: this.serviceTokens,
			context: this.context,
			logger: this.logger,
			timeoutMs: input.componentTimeoutMs,
		});

		this.resolved = true;
	}

	getMacroByTitle(title: string): MacroDefinition<any, any> | undefined {
		return this.macros.find((m) => m.title === title);
	}

	getMacros(): ReadonlyArray<MacroDefinition<any, any>> {
		return this.macros;
	}

	getContainerStartupTimings(): ReadonlyArray<{ name: string; startupMs: number }> {
		return this.containerStartupMs;
	}

	getHooks(kind: HookKind): ReadonlyArray<HookFn> {
		return this.hooksByKind.get(kind) ?? [];
	}

	async boot(): Promise<void> {
		if (!this.resolved) throw new Error("Bootstrap.boot() requires resolve() first");
		if (this.booted) throw new Error("Bootstrap.boot() may only be called once");

		this.logger.info("Booting");
		const startedAt = Date.now();

		await this.startHttpServer();
		await this.servicesLifecycle?.start();

		this.booted = true;
		this.logger.info(`Booted in ${Date.now() - startedAt}ms`);
	}

	async teardown(): Promise<void> {
		if (!this.booted) return;

		this.logger.info("Tearing down");
		const startedAt = Date.now();

		await this.servicesLifecycle?.stop();
		await this.teardownHttpServer();

		this.booted = false;
		this.logger.info(`Teardown finished in ${Date.now() - startedAt}ms`);
	}

	async provisionContainers(): Promise<void> {
		const graph = this.buildContainerDependencyGraph();

		// Cycle detection runs once on the static graph before any async work
		// kicks in. Doing it inline during traversal would race when a leaf is
		// shared by multiple roots: two parallel branches arrive at the same
		// node mid-flight and look like a cycle even though they aren't.
		this.assertNoContainerCycles(graph);

		// Memoize each token's start as a Promise so concurrent dependents
		// observe the same in-flight start instead of triggering it twice.
		const starts = new Map<unknown, Promise<void>>();

		const startContainer = (token: unknown): Promise<void> => {
			const existing = starts.get(token);
			if (existing) return existing;

			const deps = graph.get(token) ?? new Set();
			const promise = (async () => {
				await Promise.all(Array.from(deps).map((d) => startContainer(d)));
				const container = await this.context.container.resolve<any>(this.context, token as any);
				this.logger.info(`Starting container: ${container.containerName}`);
				const startedAt = Date.now();
				await container.start();
				const startupMs = Date.now() - startedAt;
				this.containerStartupMs.push({ name: container.containerName, startupMs });
				this.logger.info(`Container started: ${container.containerName} (${startupMs}ms)`);
			})();

			starts.set(token, promise);
			return promise;
		};

		await Promise.all(Array.from(graph.keys()).map((token) => startContainer(token)));
	}

	private assertNoContainerCycles(graph: Map<unknown, Set<unknown>>): void {
		const WHITE = 0;
		const GRAY = 1;
		const BLACK = 2;
		const color = new Map<unknown, number>();
		for (const token of graph.keys()) color.set(token, WHITE);

		const visit = (token: unknown, path: unknown[]): void => {
			const c = color.get(token) ?? WHITE;
			if (c === BLACK) return;
			if (c === GRAY) {
				const cycle = [...path, token].map((t) => String(t)).join(" -> ");
				throw new Error(`Circular dependency detected among containers: ${cycle}`);
			}
			color.set(token, GRAY);
			path.push(token);
			for (const dep of graph.get(token) ?? new Set<unknown>()) {
				visit(dep, path);
			}
			path.pop();
			color.set(token, BLACK);
		};

		for (const token of graph.keys()) {
			if ((color.get(token) ?? WHITE) === WHITE) visit(token, []);
		}
	}

	async deprovisionContainers(): Promise<void> {
		const graph = this.buildContainerDependencyGraph();
		const dependents = new Map<unknown, Set<unknown>>();
		for (const token of this.containerTokens) dependents.set(token, new Set());
		for (const [container, deps] of graph) {
			for (const dep of deps) {
				if (!dependents.has(dep)) dependents.set(dep, new Set());
				dependents.get(dep)!.add(container);
			}
		}

		const stopped = new Set<unknown>();

		const stopRound = async () => {
			const ready = this.containerTokens.filter((t) => {
				if (stopped.has(t)) return false;
				const ds = dependents.get(t) ?? new Set();
				return Array.from(ds).every((d) => stopped.has(d));
			});

			if (ready.length === 0) {
				if (stopped.size < this.containerTokens.length) {
					const remaining = this.containerTokens.filter((t) => !stopped.has(t));
					this.logger.warn(`Possible circular dep among containers: ${remaining.join(", ")}`);
					await Promise.all(
						remaining.map(async (token) => {
							try {
								const c = await this.context.container.resolve<any>(this.context, token as any);
								await c.stop();
							} catch (err) {
								this.logger.error(`error stopping container: ${err}`);
							}
							stopped.add(token);
						}),
					);
				}
				return;
			}

			await Promise.all(
				ready.map(async (token) => {
					try {
						const c = await this.context.container.resolve<any>(this.context, token as any);
						this.logger.info(`Stopping container: ${c.containerName}`);
						await c.stop();
						this.logger.info(`Container stopped: ${c.containerName}`);
					} catch (err) {
						this.logger.error(`error stopping container: ${err}`);
					}
					stopped.add(token);
				}),
			);

			if (stopped.size < this.containerTokens.length) {
				await stopRound();
			}
		};

		await stopRound();
	}

	private async startHttpServer(): Promise<void> {
		const factory = this.context.container.get<() => IHttpServerAdapter | Promise<IHttpServerAdapter>>(httpServerFactory);
		if (factory) {
			const adapter = await factory();
			this.registerHttpServer(adapter);
		}

		if (!this.context.container.get(OrquestraHttpServer)) {
			this.logger.debug("No HTTP server configured");
			return;
		}

		await this.context.container.resolve<OrquestraHttpServer>(this.context, OrquestraHttpServer);
	}

	private async teardownHttpServer(): Promise<void> {
		const httpServer = this.context.container.get<OrquestraHttpServer>(OrquestraHttpServer);
		if (!httpServer) return;
		try {
			await httpServer.close();
		} catch (err: any) {
			// Propagate so the worker reports it via IPC instead of swallowing
			// silently. Wrap to preserve the original error chain.
			this.logger.error(`Error closing HTTP server: ${err?.message ?? err}`);
			const wrapped = new Error(`HTTP server close failed: ${err?.message ?? err}`);
			(wrapped as any).cause = err;
			throw wrapped;
		}
	}

	private registerHttpServer(adapter: IHttpServerAdapter): void {
		const httpServer = new OrquestraHttpServer(this.context, adapter);
		this.context.container.register({ provide: OrquestraHttpServer, useValue: httpServer });
	}

	private getContainerToken(provider: ContainerProvider): unknown {
		if (typeof provider === "function") return provider;
		if ("container" in provider) {
			const inner = provider.container;
			return typeof inner === "function" ? inner : inner.provide;
		}
		return provider.provide;
	}

	private getContainerProvider(provider: ContainerProvider): any {
		if (typeof provider === "function") return provider;
		if ("container" in provider) return provider.container;
		return provider;
	}

	private buildContainerDependencyGraph(): Map<unknown, Set<unknown>> {
		const graph = new Map<unknown, Set<unknown>>();
		for (const token of this.containerTokens) graph.set(token, new Set());
		for (const [token, deps] of this.containerDependencies) {
			graph.set(token, new Set(deps));
		}
		return graph;
	}

	private instantiateSync(provider: ServiceProvider): unknown {
		if (typeof provider === "function") {
			return new (provider as any)(this.context);
		}
		if ("useClass" in provider) {
			return new (provider.useClass as any)(this.context);
		}
		if ("useValue" in provider) {
			return provider.useValue;
		}
		// FactoryProvider — async, deferred to ComponentLifecycle.start
		return undefined;
	}

	private collectContainers(providers: ReadonlyArray<ContainerProvider>): void {
		const registered = new Set<unknown>();

		const visit = (provider: ContainerProvider) => {
			const token = this.getContainerToken(provider);

			if (typeof provider !== "function" && "container" in provider && provider.dependsOn) {
				const depTokens: unknown[] = [];
				for (const dep of provider.dependsOn) {
					visit(dep);
					depTokens.push(this.getContainerToken(dep));
				}
				const previous = this.containerDependencies.get(token);
				if (previous && !sameDepSet(previous, depTokens)) {
					this.logger.warn(
						`Container "${String(token)}" was declared with conflicting dependsOn lists in different ` +
							`places. Keeping the latest declaration. Previous: [${previous.map(String).join(", ")}], ` +
							`new: [${depTokens.map(String).join(", ")}].`,
					);
				}
				this.containerDependencies.set(token, depTokens);
			}

			if (registered.has(token)) return;
			registered.add(token);

			this.context.container.register(this.getContainerProvider(provider));
			this.containerTokens.push(token);
		};

		for (const provider of providers) visit(provider);
	}
}

function sameDepSet(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
	if (a.length !== b.length) return false;
	const setA = new Set(a);
	for (const item of b) if (!setA.has(item)) return false;
	return true;
}
