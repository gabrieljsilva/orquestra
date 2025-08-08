import { Test } from "supertest";
import TestAgent from "supertest/lib/agent";
import { Injectable } from "../internal/ioc-container";
import { HttpMethod, IHttpServerAdapter, IOrquestraContext, PreRequestHook, PreRequestHookConfig } from "../types";

export abstract class HttpServerAdapter<T = any> implements IHttpServerAdapter<T> {
	protected readonly app: T;
	protected readonly httpMethods: HttpMethod[] = ["get", "post", "put", "delete", "patch", "head", "options"];
	private closeHandler: (() => Promise<void>) | null = null;
	private preRequestHooks: PreRequestHookConfig[] = [];

	public constructor(app: T) {
		this.app = app;
	}

	unwrap(): T {
		return this.app;
	}

	abstract createClient(): TestAgent<Test>;

	protected wrapHttpMethods(agent: TestAgent<Test>): TestAgent<Test> {
		for (const method of this.httpMethods) {
			const originalMethod = agent[method];

			agent[method] = (...args) => {
				const request = originalMethod.apply(agent, args);

				for (const hookConfig of this.preRequestHooks) {
					if (hookConfig.methods === "all" || !hookConfig.methods || hookConfig.methods.includes(method as HttpMethod)) {
						hookConfig.hook(request);
					}
				}

				return request;
			};
		}

		return agent;
	}

	setCloseHandler(handler: () => Promise<void>): void {
		this.closeHandler = handler;
	}

	addPreRequestHook(hook: PreRequestHook | PreRequestHookConfig, methods?: HttpMethod | HttpMethod[] | "all"): void {
		if (typeof hook === "function") {
			if (!methods || methods === "all") {
				this.preRequestHooks.push({
					hook,
					methods: "all",
				});
				return;
			}
			if (Array.isArray(methods)) {
				this.preRequestHooks.push({
					hook,
					methods,
				});
				return;
			}
			return;
		}
		this.preRequestHooks.push(hook);
	}

	async close(): Promise<void> {
		if (this.closeHandler) {
			await this.closeHandler();
		}
	}
}

export class OrquestraHttpServer extends Injectable {
	private adapter: IHttpServerAdapter;

	constructor(ctx: IOrquestraContext, adapter: IHttpServerAdapter) {
		super(ctx);
		this.adapter = adapter;
	}

	unwrap(): any {
		return this.adapter.unwrap();
	}

	createClient(): TestAgent<Test> {
		return this.adapter.createClient();
	}

	setCloseHandler(handler: () => Promise<void>): void {
		this.adapter.setCloseHandler(handler);
	}

	addPreRequestHook(hook: PreRequestHook | PreRequestHookConfig, methods?: HttpMethod | HttpMethod[] | "all"): void {
		this.adapter.addPreRequestHook(hook, methods);
	}

	async close(): Promise<void> {
		await this.adapter.close();
	}
}
