import { BddRunner, type HookFailure } from "@orquestra/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { _ensureInstance, _resetConfigured } from "./configure";

/**
 * Subset of Vitest's API that the bridge needs. Decoupling on this interface
 * makes the registration logic testable without spying on ESM module
 * namespaces (ESM doesn't allow redefining exports — `vi.spyOn(vitest, ...)`
 * fails at runtime).
 */
export interface VitestHooks {
	describe: (name: string, body: () => void) => void;
	it: (name: string, body: () => void | Promise<void>) => void;
	beforeAll: (body: () => void | Promise<void>) => void;
	afterAll: (body: () => void | Promise<void>) => void;
	beforeEach: (body: () => void | Promise<void>) => void;
	afterEach: (body: () => void | Promise<void>) => void;
}

/**
 * Translates the features registered via `feature()` into Vitest
 * `describe` / `it` blocks and wires up the per-file `WorkerOrquestra`
 * lifecycle (boot before all tests, shutdown after).
 *
 * Must be called **after** all features are declared in the file —
 * typically the last statement.
 */
export function runFeatures(): void {
	_registerWithHooks({ describe, it, beforeAll, afterAll, beforeEach, afterEach });
}

/**
 * Internal — same as `runFeatures` but accepts Vitest hooks as an injection
 * point so the registration logic can be unit-tested.
 */
export function _registerWithHooks(hooks: VitestHooks): void {
	const orq = _ensureInstance();
	const features = orq.getBddContainer().getFeatures();

	hooks.beforeAll(async () => {
		await orq.boot();
	});

	hooks.afterAll(async () => {
		try {
			await orq.shutdown();
		} finally {
			_resetConfigured();
		}
	});

	for (const feature of features) {
		hooks.describe(feature.getName(), () => {
			hooks.beforeAll(async () => {
				const failures = await orq.runHooks("beforeEachFeature", "FIFO");
				throwIfFailures("beforeEachFeature", failures);
			});

			hooks.afterAll(async () => {
				const failures = await orq.runHooks("afterEachFeature", "LIFO");
				throwIfFailures("afterEachFeature", failures);
			});

			hooks.beforeEach(async () => {
				const failures = await orq.runHooks("beforeEachScenario", "FIFO");
				throwIfFailures("beforeEachScenario", failures);
			});

			hooks.afterEach(async () => {
				const failures = await orq.runHooks("afterEachScenario", "LIFO");
				throwIfFailures("afterEachScenario", failures);
			});

			for (const scenario of feature.getScenarios()) {
				hooks.it(scenario.name, async () => {
					await BddRunner.runScenario(scenario);
				});
			}
		});
	}
}

function throwIfFailures(kind: string, failures: HookFailure[]): void {
	if (failures.length === 0) return;
	const first = failures[0];
	const err = new Error(`${kind} hook failed: ${first.error.message}`);
	if (first.error.stack) err.stack = first.error.stack;
	throw err;
}
