import { getOrquestraInstance } from "../orquestra/global";
import type { FeatureDefinition } from "../types/bdd";

/**
 * Declares a BDD feature. Equivalent to `orquestra.feature(name, definition)`
 * but importable as a top-level function (Vitest/Jest style).
 *
 * Usage tip: avoid naming the local variable `feature` to prevent shadowing
 * the imported function. Prefer descriptive names like `loginFeature`,
 * `usersFeature`, etc.
 */
export function defineFeature(name: string, definition: FeatureDefinition) {
	return getOrquestraInstance().feature(name, definition);
}
