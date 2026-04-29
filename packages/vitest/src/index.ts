// Public API of @orquestra/vitest — bridge from Orquestra's code-first BDD to
// Vitest. Compose this with re-exports from `@orquestra/core` (`attach`, `log`,
// `beforeEachScenario`, `afterEachScenario`, `defineModule`, `defineMacro`)
// to keep import paths short in test files.
export { configure, defineFeature, runFeatures } from "./lib";
export type { ConfigureOptions, FeatureOptions } from "./lib";
