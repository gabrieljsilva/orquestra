import { Test } from "supertest";
import TestAgent from "supertest/lib/agent";

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options";
export type PreRequestHook = (agent: TestAgent<Test>) => void | Promise<void>;

export interface PreRequestHookConfig {
	hook: PreRequestHook;
	methods?: HttpMethod[] | "all";
}

export interface IHttpServerAdapter<T = any> {
	unwrap(): T;
	createClient(): TestAgent<Test>;
	setCloseHandler(handler: () => Promise<void>): void;
	addPreRequestHook(hook: PreRequestHook | PreRequestHookConfig, methods?: HttpMethod | HttpMethod[] | "all"): void;
	close(): Promise<void>;
}
