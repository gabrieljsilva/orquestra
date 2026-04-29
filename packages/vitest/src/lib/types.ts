import type { WorkerOrquestraOptions } from "@orquestra/core";

/**
 * Same shape as the runner's `worker` config block — services, modules, macros,
 * env, logger. The bridge passes these straight through to `WorkerOrquestra`,
 * so anything that works in `orquestra test` works here too (with the obvious
 * exception of `httpServer`, which is rejected — unit/integration tests
 * shouldn't boot an HTTP server).
 */
export interface ConfigureOptions extends Omit<WorkerOrquestraOptions, "httpServer"> {}

/**
 * Feature definition for code-first BDD in unit/integration tests.
 *
 * Independent of `FeatureDefinition` in `@orquestra/core`:
 * - All fields are optional, including the narrative trio (`as` / `I` /
 *   `so`). Pure technical unit tests should be able to declare just a
 *   feature name.
 * - `as` and `domain` are plain `string`, not the typed `RegistryPersona`
 *   / `RegistryDomain` unions that the runner generates from
 *   `orquestra.spec.ts`. Unit tests don't have to enumerate themselves
 *   in the spec — they don't contribute to the E2E persona/domain
 *   artifact aggregation.
 *
 * At runtime the bridge casts this to the engine's `FeatureDefinition`;
 * both shapes are pure strings, so no unsafe coercion happens.
 */
export interface FeatureOptions {
	context?: string;
	/** Domain bucket. Any string — unit tests don't have to match the registry. */
	domain?: string;
	/** Persona narrative. Any string — unit tests don't have to match the registry. */
	as?: string;
	I?: string;
	so?: string;
	timeoutMs?: number;
}

