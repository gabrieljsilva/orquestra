import type { FeatureDefinition } from "@orquestra/core";
import { _ensureInstance } from "./configure";
import type { FeatureOptions } from "./types";

/**
 * Declares a code-first BDD feature that compiles to Vitest `describe` / `it`
 * when `runFeatures()` is called at the end of the file.
 *
 * Mirrors `defineFeature` from `@orquestra/core` — same shape, same chained
 * `.scenario(...).given(...).when(...).then(...)` DSL, plus auto-init of
 * the per-file `WorkerOrquestra` on first call (so pure unit tests can
 * skip `configure()` entirely).
 *
 * For unit/integration tests the persona narrative (`as` / `I` / `so`) is
 * usually irrelevant and can be omitted — pass just the name (and optional
 * `context` / `domain`).
 *
 * @example
 * ```ts
 * const calc = defineFeature("Calculator");
 *
 * calc.scenario("adds two positives")
 *   .given("a calculator", () => ({ c: new Calculator() }))
 *   .when("I add 2 and 3", ({ c }) => ({ result: c.add(2, 3) }))
 *   .then("returns 5", ({ result }) => expect(result).toBe(5));
 *
 * calc.scenario("subtracts")
 *   .given("a calculator", () => ({ c: new Calculator() }))
 *   .when("I subtract 5 from 10", ({ c }) => ({ result: c.sub(10, 5) }))
 *   .then("returns 5", ({ result }) => expect(result).toBe(5));
 * ```
 */
export function defineFeature(name: string, options: FeatureOptions = {}) {
	// Cast to the strict `FeatureDefinition` from core: at runtime `as` and
	// `domain` are plain strings either way; the type widening only affects
	// the bridge's authoring surface, not the underlying engine.
	return _ensureInstance().feature(name, options as FeatureDefinition);
}
