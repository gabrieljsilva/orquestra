import { getOrquestraInstance, initOrquestra, resetOrquestraInstance, type WorkerOrquestra } from "@orquestra/core";
import type { ConfigureOptions } from "./types";

let explicitlyConfigured = false;
let autoConfigured = false;

/**
 * Initializes the per-file `WorkerOrquestra` with services, modules, macros
 * or env. **Optional** — pure unit tests that don't register anything can
 * skip this entirely; the bridge auto-initializes an empty instance the
 * first time `feature()` is called.
 *
 * If you DO need to register dependencies, call `configure({...})` once at
 * the top of the file, **before any `feature()` call**. Calling it after a
 * feature has been declared (which would have auto-initialized) throws.
 */
export function configure(options: ConfigureOptions = {}): void {
	if (explicitlyConfigured) {
		throw new Error(
			"@orquestra/vitest: configure() called more than once in the same test file. The WorkerOrquestra instance is per-file.",
		);
	}
	if (autoConfigured) {
		throw new Error(
			"@orquestra/vitest: configure() must be called BEFORE any feature() declaration. " +
				"A feature() call earlier in this file already auto-initialized an empty instance — move configure() to the top of the file.",
		);
	}
	if ("httpServer" in options) {
		throw new Error(
			"@orquestra/vitest: httpServer is not supported in unit/integration tests. Drop the field — orquestra.http will throw if used in this context, which is the expected behavior.",
		);
	}
	initOrquestra(options);
	explicitlyConfigured = true;
}

/**
 * Returns the active `WorkerOrquestra`, auto-initializing an empty one on
 * first call when `configure()` was not used. Internal — `feature()` and
 * `runFeatures()` rely on this.
 */
export function _ensureInstance(): WorkerOrquestra {
	try {
		return getOrquestraInstance();
	} catch {
		initOrquestra({});
		autoConfigured = true;
		return getOrquestraInstance();
	}
}

/**
 * Internal — used by `runFeatures()` to release the singleton after the
 * file's tests run. Tests should never call this directly.
 */
export function _resetConfigured(): void {
	resetOrquestraInstance();
	explicitlyConfigured = false;
	autoConfigured = false;
}
