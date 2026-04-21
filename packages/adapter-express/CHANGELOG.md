# @orquestra/adapter-express

## 2.0.0

### Major Changes

- Business-Oriented Software Specification platform with owned CLI runner.

  Orquestra is no longer a library coupled to Vitest/Jest. It now ships its
  own CLI test runner (`npx orquestra test`), generates a structured
  `artifact.json` consumable by LLMs and dashboards, and introduces BDD
  primitives (features, scenarios, steps) with type inference.

  Highlights:

  - **New package** `@orquestra/runner` with CLI (`test`, `types`),
    `orquestra.config.ts`, `orquestra.spec.ts`, feature discovery, and IPC-based
    parallelism across `child_process.fork` workers with a work-stealing queue.
  - **Business-oriented primitives**: `FeatureDefinition` gains `context` and
    `domain`; `orquestra.spec.ts` declares `glossary` and `domains`; personas
    are auto-extracted from the `as` field.
  - **Type generation**: `npx orquestra types` emits a `.d.ts` that augments
    `OrquestraRegistry` with typed unions for personas, domains and macro
    titles; macro context is inferred from a generic (`OrquestraMacro<T>`).
  - **Reporters**: new `OrquestraHtmlReporter` with hierarchical UI; reporter
    API now consumes `OrquestraArtifact` directly; `reporters: []` array in
    config.
  - **DX improvements**: `orquestra.get(Class)` infers the return type; step
    functions can return `void`; pending scenarios for specification-first
    workflows; Injectable base auto-injects a scoped `this.logger`
    (NestJS-style).
  - **Lifecycle changes**: containers now start before helpers (so helpers can
    depend on envs written by containers); services `onStart`/`onTeardown` are
    properly awaited.

  **BREAKING CHANGES**. See `MIGRATION.md` at the repo root for a side-by-side
  guide covering 16 areas of breaking changes.

### Patch Changes

- Updated dependencies
  - @orquestra/core@2.0.0

## 1.0.0

### Major Changes

- dc71605: Pluggable reporter API with versioned run artifacts.

  - **Breaking**: `orquestra.teardown()` no longer prints the BDD report automatically.
    Reporting is now opt-in via `orquestra.report(new OrquestraConsoleReporter())`.
  - **Breaking**: `OrquestraConsoleReporter.run()` is no longer a static method.
    Create an instance and pass it to `orquestra.report()`.
  - Added abstract `OrquestraReporter` base class for custom reporters (HTML, JSON, etc.).
  - Added `manifest.json` and `meta.json` artifacts under `.orquestra/<runId>/` for
    versioned, retroactive reporting.
  - Added `historyLimit` option (default `1`) to prune old runs on `start()`.
  - Added semver compatibility checks: different major aborts report, different minor warns.
  - New public exports: `OrquestraReporter`, `OrquestraConsoleReporter`, `FeatureMeta`,
    `RunManifest`, `StepEvent`, `StepStatus`.

### Patch Changes

- Updated dependencies [dc71605]
  - @orquestra/core@1.0.0

## 0.2.0

### Minor Changes

- added bdd API and macros support

### Patch Changes

- Updated dependencies
  - @orquestra/core@0.2.0

## 0.1.0

### Patch Changes

- Updated dependencies
  - @orquestra/core@0.1.0

## 0.0.2

### Patch Changes

- fixed: typings, imports and build worflow
- Updated dependencies
  - @orquestra/core@0.0.2

## 0.0.1

### Patch Changes

- 95a5546: added: Orquestra core, adapter express and adapter fastify
- Updated dependencies [95a5546]
  - @orquestra/core@0.0.1
