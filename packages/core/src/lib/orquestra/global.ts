import type { Injectable } from "../internal/ioc-container";
import type { FeatureDefinition } from "../types/bdd";
import type { ClassConstructor, OrquestraOptions } from "../types";
import { Orquestra } from "./orquestra";

let instance: Orquestra | null = null;

export function initOrquestra(options: OrquestraOptions): Orquestra {
	if (instance) {
		throw new Error(
			"Orquestra already initialized. initOrquestra() must be called exactly once per process (typically by the runner).",
		);
	}
	instance = new Orquestra(options);
	return instance;
}

export function getOrquestraInstance(): Orquestra {
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

export interface OrquestraFacade {
	feature: Orquestra["feature"];
	readonly http: Orquestra["http"];
	get<T extends Injectable>(token: ClassConstructor<T>): T;
	get<T extends Injectable>(token: string | Symbol): T;
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
};
