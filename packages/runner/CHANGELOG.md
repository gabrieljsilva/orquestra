# @orquestra/runner

## 3.1.0

### Patch Changes

- Updated dependencies
  - @orquestra/core@3.1.0

## 3.0.0

### Minor Changes

- **Attachment spillover.** The worker now writes oversized and binary
  attachments to `outputDir/attachments/<scenarioId>/<n>-<safeName>.<ext>`
  before forwarding the step event over IPC, replacing the inline payload
  with a relative `path` on the artifact. Small text/markdown/json under
  `inlineThresholdBytes` (default 50 KB) stay inline. Image and file
  attachments are always spilled. See the `@orquestra/core` changelog for
  the user-facing API (`attach` / `log`).

## 2.1.0

### Minor Changes

- 008d3bf: Swap the internal TypeScript loader to SWC, respecting the project's `tsconfig.json`.

  ### `@orquestra/runner`

  - **Transpile via SWC** — the runner now replaces jiti's default Babel pipeline
    with an SWC-based transformer. `tsconfig.json` is discovered from the
    `orquestra.config.ts` directory (walking upward) and mapped into SWC options
    automatically:
    - `experimentalDecorators: true` → legacy decorators + proper
      `transform-class-properties` ordering (fixes the long-standing
      `"Decorating class property failed"` error on Nest/TypeORM/class-validator
      projects).
    - `emitDecoratorMetadata: true` → `Reflect.metadata(...)` emission.
    - `target`, `baseUrl`, `paths`, `extends` are honored.
  - **New CLI flag `--tsconfig <path>`** on `orquestra test` and `orquestra types`
    to override the auto-discovered `tsconfig.json`. Paths may be absolute or
    relative to the config directory.
  - **Worker transpilation is cache-safe** — jiti's filesystem cache is disabled
    by default so upgrades never pick up stale Babel-transpiled artifacts.
  - **`postbuild` chmod** ensures the published CLI bin keeps its executable bit.
  - Error from `@swc/core` failing to load surfaces as `SwcNotAvailableError`
    pointing at a likely postinstall issue.
  - Added `@swc/core` as a direct dependency.

  ### `@orquestra/core`

  - **Container lifecycle logs are visible by default** — `Starting container:
<name>` / `Container started: <name>` (same for stop) now log at `info`
    level instead of `debug`. Helpers, plugins, and macros still use `debug`.
  - **Logger identifies the worker that emitted each line** — in parallel
    runs, log prefixes gain a `:W<id>` suffix when emitted from a forked
    worker (e.g. `[Orquestra:W0]`, `[TestDatabaseService:W1]`). The main
    process keeps the plain `[Orquestra]` prefix.

  ### Known limitations

  - Output module format is always CommonJS.
  - jiti's `import.meta.env` / `import.meta.paths` / `import.meta.resolve`
    helpers are not available under the SWC transformer.

### Patch Changes

- Updated dependencies [008d3bf]
  - @orquestra/core@2.1.0

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

  **BREAKING CHANGES**. See the v2.0.0 GitHub release notes for the full
  side-by-side guide.

### Patch Changes

- Updated dependencies
  - @orquestra/core@2.0.0
