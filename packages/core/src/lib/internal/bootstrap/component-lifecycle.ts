import type { IOrquestraContext } from "../../types";
import type { Injectable, IocContainer } from "../ioc-container";
import type { Logger } from "../logger";
import { withTimeout } from "../timeout";

/**
 * Generic onStart/onTeardown loop reusable across component categories
 * (services, helpers-as-services, macros). Hides the resolve+invoke cycle
 * so the Bootstrap orchestrator stays declarative.
 *
 * Each onStart/onTeardown call is timeout-guarded — a stuck Promise must not
 * be allowed to hang the whole worker.
 */
export class ComponentLifecycle<T extends Injectable = Injectable> {
	private readonly tokens: ReadonlyArray<unknown>;
	private readonly context: IOrquestraContext;
	private readonly logger: Logger;
	private readonly label: string;
	private readonly timeoutMs?: number;

	constructor(args: {
		label: string;
		tokens: ReadonlyArray<unknown>;
		context: IOrquestraContext;
		logger: Logger;
		timeoutMs?: number;
	}) {
		this.label = args.label;
		this.tokens = args.tokens;
		this.context = args.context;
		this.logger = args.logger;
		this.timeoutMs = args.timeoutMs;
	}

	async start(): Promise<void> {
		this.logger.debug(`starting ${this.label}`);
		const startedAt = Date.now();
		const container = this.context.container as IocContainer;
		for (const token of this.tokens) {
			const instance = await container.resolve<T>(this.context, token as any);
			if (instance?.onStart) {
				const componentName = String((instance as any)?.constructor?.name ?? token);
				await withTimeout(
					() => Promise.resolve(instance.onStart!()),
					this.timeoutMs,
					`${this.label}.onStart(${componentName})`,
				);
			}
		}
		this.logger.debug(`${this.label} started in ${Date.now() - startedAt}ms`);
	}

	async stop(): Promise<void> {
		this.logger.debug(`stopping ${this.label}`);
		const startedAt = Date.now();
		const container = this.context.container as IocContainer;
		for (const token of [...this.tokens].reverse()) {
			const instance = await container.resolve<T>(this.context, token as any);
			if (!instance?.onTeardown) continue;
			const componentName = String((instance as any)?.constructor?.name ?? token);
			try {
				await withTimeout(
					() => Promise.resolve(instance.onTeardown!()),
					this.timeoutMs,
					`${this.label}.onTeardown(${componentName})`,
				);
			} catch (err) {
				this.logger.error(`error tearing down ${this.label}: ${err}`);
			}
		}
		this.logger.debug(`${this.label} stopped in ${Date.now() - startedAt}ms`);
	}
}
