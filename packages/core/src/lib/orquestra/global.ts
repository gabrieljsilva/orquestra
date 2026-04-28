import type { Injectable } from "../internal/ioc-container";
import type { ClassConstructor, WorkerOrquestraOptions } from "../types";
import type { FeatureDefinition } from "../types/bdd";
import type { HookFn } from "../types/lifecycle/hook.types";
import { WorkerOrquestra } from "./worker-orquestra";

let instance: WorkerOrquestra | null = null;

export function initOrquestra(options: WorkerOrquestraOptions): WorkerOrquestra {
	if (instance) {
		throw new Error(
			"Orquestra already initialized. initOrquestra() must be called exactly once per file (typically by the runner).",
		);
	}
	instance = new WorkerOrquestra(options);
	return instance;
}

export function getOrquestraInstance(): WorkerOrquestra {
	if (!instance) {
		throw new Error(
			"Orquestra not initialized. Feature files must be loaded by the @orquestra/runner CLI. If you're running tests manually, call initOrquestra() first.",
		);
	}
	return instance;
}

export function resetOrquestraInstance(): void {
	instance = null;
}

// =============================================================================
// Free function exports (Vitest-style). Each delegates to the current
// WorkerOrquestra instance. They live alongside the `orquestra` facade object
// so users can pick the style they prefer.
// =============================================================================

export function beforeStartServer(fn: HookFn): void {
	getOrquestraInstance().registerHook("beforeStartServer", fn);
}

export function afterStartServer(fn: HookFn): void {
	getOrquestraInstance().registerHook("afterStartServer", fn);
}

export function beforeEachFeature(fn: HookFn): void {
	getOrquestraInstance().registerHook("beforeEachFeature", fn);
}

export function afterEachFeature(fn: HookFn): void {
	getOrquestraInstance().registerHook("afterEachFeature", fn);
}

export function beforeEachScenario(fn: HookFn): void {
	getOrquestraInstance().registerHook("beforeEachScenario", fn);
}

export function afterEachScenario(fn: HookFn): void {
	getOrquestraInstance().registerHook("afterEachScenario", fn);
}

export function beforeStopServer(fn: HookFn): void {
	getOrquestraInstance().registerHook("beforeStopServer", fn);
}

export function useEnv(vars: Record<string, string>): void {
	getOrquestraInstance().useEnv(vars);
}

// =============================================================================
// Facade object (alternative style — keeps the `orquestra.x` form).
// =============================================================================

export interface OrquestraFacade {
	feature: WorkerOrquestra["feature"];
	readonly http: WorkerOrquestra["http"];
	get<T extends Injectable>(token: ClassConstructor<T>): T;
	get<T extends Injectable>(token: string | Symbol): T;
	beforeStartServer(fn: HookFn): void;
	afterStartServer(fn: HookFn): void;
	beforeEachFeature(fn: HookFn): void;
	afterEachFeature(fn: HookFn): void;
	beforeEachScenario(fn: HookFn): void;
	afterEachScenario(fn: HookFn): void;
	beforeStopServer(fn: HookFn): void;
	useEnv(vars: Record<string, string>): void;
}

export const orquestra: OrquestraFacade = {
	feature(name: string, definition: FeatureDefinition) {
		return getOrquestraInstance().feature(name, definition);
	},
	get http() {
		return getOrquestraInstance().http;
	},
	get<T extends Injectable>(token: string | Function | Symbol): T {
		return getOrquestraInstance().get<T>(token as any);
	},
	beforeStartServer,
	afterStartServer,
	beforeEachFeature,
	afterEachFeature,
	beforeEachScenario,
	afterEachScenario,
	beforeStopServer,
	useEnv,
};
