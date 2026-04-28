import { OrquestraHttpServer } from "../adapters";
import { logger as defaultLogger } from "../constants";
import { EnvHelper } from "../helpers/env";
import { Bootstrap } from "../internal/bootstrap";
import { Injectable, IocContainer } from "../internal/ioc-container";
import type { Logger } from "../internal/logger";
import { BddContainer, Step, StepKind } from "../internal/orquestra-bdd-container";
import { OrquestraContext } from "../internal/orquestra-context";
import { withTimeout } from "../internal/timeout";
import type { ClassConstructor, IOrquestraContext, WorkerOrquestraOptions } from "../types";
import type { FeatureDefinition } from "../types/bdd";
import type { StepEvent } from "../types/events";
import type { HookContext, HookFailure, HookFn, HookKind } from "../types/lifecycle/hook.types";
import type { FeatureMeta } from "../types/reporting";

type HookOrder = "FIFO" | "LIFO";

const DEFAULT_EACH_HOOK_TIMEOUT_MS = 10_000;
const DEFAULT_SERVER_HOOK_TIMEOUT_MS = 60_000;

const SERVER_HOOK_KINDS: ReadonlySet<HookKind> = new Set(["beforeStartServer", "afterStartServer", "beforeStopServer"]);

const HTTP_NOT_READY_MESSAGE =
	"ctx.http is not available in beforeStartServer (the http server has not started yet). Use ctx.env or ctx.container instead.";

/**
 * Worker-scoped Orquestra. Lives inside a worker process, instantiated per
 * feature file. Owns http server, services, macros and lifecycle hooks.
 */
type WorkerPhase =
	| "registering"
	| "beforeStartServer"
	| "afterStartServer"
	| "running"
	| "beforeStopServer"
	| "stopped";

export class WorkerOrquestra {
	private readonly context: IOrquestraContext;
	private readonly logger: Logger;
	private readonly bddContainer: BddContainer;
	private readonly bootstrap: Bootstrap;
	private readonly eachHookTimeoutMs: number;
	private readonly serverHookTimeoutMs: number;
	private phase: WorkerPhase = "registering";

	private readonly fileHooks: Record<HookKind, HookFn[]> = {
		beforeStartServer: [],
		beforeEachFeature: [],
		beforeEachScenario: [],
		beforeStopServer: [],
		afterStartServer: [],
		afterEachFeature: [],
		afterEachScenario: [],
	};

	constructor(options: WorkerOrquestraOptions) {
		this.logger = options.logger ?? defaultLogger;
		this.eachHookTimeoutMs = options.eachHookTimeoutMs ?? DEFAULT_EACH_HOOK_TIMEOUT_MS;
		this.serverHookTimeoutMs = options.serverHookTimeoutMs ?? DEFAULT_SERVER_HOOK_TIMEOUT_MS;

		const container = new IocContainer(this.logger);
		this.context = new OrquestraContext(container);

		this.bootstrap = new Bootstrap(this.context, this.logger);
		this.bootstrap.resolve({
			httpServer: options.httpServer,
			services: options.services,
			macros: options.macros,
			modules: options.modules,
			env: options.env,
			// Service onStart/onTeardown is server-scope work — same budget as
			// before/afterStartServer hooks.
			componentTimeoutMs: this.serverHookTimeoutMs,
		});

		this.bddContainer = new BddContainer();
		this.bddContainer.setMacroStepFactory((kind, title) => this.buildMacroStep(kind, title));
	}

	feature(name: string, definition: FeatureDefinition) {
		return this.bddContainer.define(name, definition);
	}

	getBddContainer(): BddContainer {
		return this.bddContainer;
	}

	getEvents(): StepEvent[] {
		return this.bddContainer.getEvents();
	}

	getFeatureMeta(): FeatureMeta[] {
		return this.bddContainer.getFeatureMeta();
	}

	registerHook(kind: HookKind, fn: HookFn): void {
		this.assertHookCanRegister(kind);
		this.fileHooks[kind].push(fn);
	}

	useEnv(vars: Record<string, string>): void {
		this.registerHook("beforeStartServer", (ctx) => {
			for (const [k, v] of Object.entries(vars)) {
				ctx.env.override(k, v);
			}
		});
	}

	/**
	 * Hooks must be registered before their phase has started — otherwise the
	 * registration silently no-ops, which is the classic "I called useEnv
	 * inside a step and nothing happened" footgun.
	 */
	private assertHookCanRegister(kind: HookKind): void {
		const phaseIndex = WorkerOrquestra.PHASE_ORDER.indexOf(this.phase);
		const hookPhaseIndex = WorkerOrquestra.PHASE_ORDER.indexOf(kind as WorkerPhase);
		// `>=` because once we're already executing the same phase, the
		// snapshot of hooks has been taken — a late registration would silently
		// be ignored. Reject it instead of swallowing the call.
		if (hookPhaseIndex !== -1 && phaseIndex >= hookPhaseIndex) {
			throw new Error(
				`Cannot register "${kind}" hook — that phase has already run (current phase: ${this.phase}). ` +
					`Move the call to module top-level or to an earlier hook.`,
			);
		}
	}

	private advancePhaseFor(kind: HookKind): void {
		const target = WorkerOrquestra.PHASE_ORDER.indexOf(kind as WorkerPhase);
		if (target === -1) return;
		const current = WorkerOrquestra.PHASE_ORDER.indexOf(this.phase);
		if (target > current) {
			this.phase = kind as WorkerPhase;
		}
	}

	private static readonly PHASE_ORDER: WorkerPhase[] = [
		"registering",
		"beforeStartServer",
		"afterStartServer",
		"running",
		"beforeStopServer",
		"stopped",
	];

	get http() {
		const server = this.context.container.get<OrquestraHttpServer>(OrquestraHttpServer);
		if (!server) throw new Error(HTTP_NOT_READY_MESSAGE);
		return server.createClient();
	}

	get<T extends Injectable>(token: ClassConstructor<T>): T;
	get<T extends Injectable>(token: string | Symbol): T;
	get<T extends Injectable>(token: string | Function | Symbol): T {
		const instance = this.context.container.get<T>(token as any);
		if (!instance) {
			throw new Error(`Service not found for token: ${String(token)}`);
		}
		return instance;
	}

	async boot(): Promise<void> {
		await this.bootstrap.boot();
		this.advancePhaseFor("afterStartServer");
		this.phase = "running";
	}

	async shutdown(): Promise<void> {
		await this.bootstrap.teardown();
		this.phase = "stopped";
	}

	/**
	 * Runs hooks of a kind, merging file-scoped registrations with module-scoped
	 * ones (modules first, in declaration order; file-scoped after).
	 * Setup phases (FIFO) abort on first failure; cleanup phases (LIFO) keep
	 * running and accumulate failures.
	 */
	async runHooks(kind: HookKind, order: HookOrder): Promise<HookFailure[]> {
		this.advancePhaseFor(kind);
		const moduleHooks = this.bootstrap.getHooks(kind);
		const fileHooks = this.fileHooks[kind];
		const all = [...moduleHooks, ...fileHooks];
		if (all.length === 0) return [];

		const sequence = order === "LIFO" ? [...all].reverse() : [...all];
		const failures: HookFailure[] = [];
		const isCleanup = order === "LIFO";

		const isServerHook = SERVER_HOOK_KINDS.has(kind);
		const timeoutMs = isServerHook ? this.serverHookTimeoutMs : this.eachHookTimeoutMs;
		const tuneKnob = isServerHook ? "serverHookTimeoutMs" : "eachHookTimeoutMs";

		for (const hook of sequence) {
			// Build a fresh ctx per hook so a hook that closes the http server
			// (or swaps any registered service) is reflected in the next one's
			// view, instead of all hooks sharing a stale snapshot.
			const ctx = this.buildHookContext();
			const startedAt = performance.now();
			try {
				await withTimeout(() => Promise.resolve(hook(ctx)), timeoutMs, `hook ${kind}`, { tuneKnob });
			} catch (err: any) {
				const failure: HookFailure = {
					hookName: kind,
					error: { message: String(err?.message ?? err), stack: err?.stack },
					durationMs: Math.round(performance.now() - startedAt),
				};
				failures.push(failure);
				if (!isCleanup) return failures;
			}
		}

		return failures;
	}

	private buildMacroStep(kind: StepKind, title: string): Step<any, any> | undefined {
		const macro = this.bootstrap.getMacroByTitle(title);
		if (!macro) return undefined;
		return new Step<any, any>(kind, title, async () => {
			// Macros invoked by step title receive no input — the second argument
			// of `defineMacro({ execute })` is reserved for direct programmatic
			// calls. Use `.given(name, fn)` with an explicit body to forward args.
			const hookCtx = this.buildHookContext();
			const result = await macro.execute(hookCtx, undefined as any);
			return result as any;
		});
	}

	private buildHookContext(): HookContext {
		const orq = this;

		return {
			get env() {
				return orq.context.container.get<EnvHelper>(EnvHelper) as EnvHelper;
			},
			get http() {
				const server = orq.context.container.get<OrquestraHttpServer>(OrquestraHttpServer);
				if (!server) {
					throw new Error(HTTP_NOT_READY_MESSAGE);
				}
				return server;
			},
			get<T extends Injectable>(token: any): T {
				return orq.get<T>(token);
			},
			container: this.context.container,
		};
	}
}
