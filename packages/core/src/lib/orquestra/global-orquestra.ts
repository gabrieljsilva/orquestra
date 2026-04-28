import { logger as defaultLogger } from "../constants";
import { EnvHelper } from "../helpers/env";
import { Bootstrap } from "../internal/bootstrap";
import { type Injectable, IocContainer } from "../internal/ioc-container";
import type { Logger } from "../internal/logger";
import { OrquestraContext } from "../internal/orquestra-context";
import { withTimeout } from "../internal/timeout";
import type { ClassConstructor, GlobalOrquestraOptions, IOrquestraContext } from "../types";
import type { GlobalHookContext, GlobalHookFn, GlobalHookKind } from "../types/lifecycle/hook.types";

const DEFAULT_GLOBAL_HOOK_TIMEOUT_MS = 60_000;

/**
 * Global-scoped Orquestra. Lives in the main process, manages testcontainers
 * shared across workers. Exposes `provision`/`deprovision` and runs the
 * config-time global hooks at the right boundaries.
 *
 * Important: this scope **never owns an HTTP server** — each worker boots
 * its own. The hook context is intentionally narrower than the worker hook
 * context (no `http`).
 */
export class GlobalOrquestra {
	private readonly bootstrap: Bootstrap;
	private readonly context: IOrquestraContext;
	private readonly logger: Logger;
	private readonly hookTimeoutMs: number;
	private readonly hooks: Record<GlobalHookKind, ReadonlyArray<GlobalHookFn>>;

	constructor(options: GlobalOrquestraOptions) {
		this.logger = options.logger ?? defaultLogger;
		this.hookTimeoutMs = options.hookTimeoutMs ?? DEFAULT_GLOBAL_HOOK_TIMEOUT_MS;

		const container = new IocContainer(this.logger);
		this.context = new OrquestraContext(container);

		this.bootstrap = new Bootstrap(this.context, this.logger);
		this.bootstrap.resolve({
			containers: options.containers,
			env: options.env,
		});

		this.hooks = {
			beforeProvision: options.beforeProvision ?? [],
			afterProvision: options.afterProvision ?? [],
			beforeDeprovision: options.beforeDeprovision ?? [],
			afterDeprovision: options.afterDeprovision ?? [],
		};
	}

	async provision(): Promise<void> {
		await this.runHooks("beforeProvision", /*abortOnFail*/ true);
		this.logger.info("Provisioning infra");
		const startedAt = Date.now();
		await this.bootstrap.provisionContainers();
		this.logger.info(`Provision finished in ${Date.now() - startedAt}ms`);
		await this.runHooks("afterProvision", true);
	}

	async deprovision(): Promise<void> {
		// Cleanup-side hooks must not abort each other — collect failures and
		// keep going so containers still come down even if a dump hook throws.
		await this.runHooks("beforeDeprovision", false);
		this.logger.info("Deprovisioning infra");
		const startedAt = Date.now();
		await this.bootstrap.deprovisionContainers();
		this.logger.info(`Deprovision finished in ${Date.now() - startedAt}ms`);
		await this.runHooks("afterDeprovision", false);
	}

	getContainerStartupTimings(): ReadonlyArray<{ name: string; startupMs: number }> {
		return this.bootstrap.getContainerStartupTimings();
	}

	private async runHooks(kind: GlobalHookKind, abortOnFail: boolean): Promise<void> {
		const fns = this.hooks[kind];
		if (fns.length === 0) return;

		for (const fn of fns) {
			const ctx = this.buildHookContext();
			try {
				await withTimeout(() => Promise.resolve(fn(ctx)), this.hookTimeoutMs, `global hook ${kind}`);
			} catch (err: any) {
				const msg = `[orquestra] global hook ${kind} failed: ${err?.message ?? err}`;
				if (abortOnFail) {
					const wrapped = new Error(msg);
					(wrapped as any).cause = err;
					throw wrapped;
				}
				this.logger.error(msg);
			}
		}
	}

	private buildHookContext(): GlobalHookContext {
		const orq = this;
		return {
			get env() {
				return orq.context.container.get<EnvHelper>(EnvHelper) as EnvHelper;
			},
			get<T extends Injectable>(token: ClassConstructor<T> | string | Symbol): T {
				const instance = orq.context.container.get<T>(token as any);
				if (!instance) {
					throw new Error(`Service not found in global IoC for token: ${String(token)}`);
				}
				return instance;
			},
			container: this.context.container,
		};
	}
}
