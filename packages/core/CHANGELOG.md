# @orquestra/core

## 3.2.0

### Minor Changes

- 6eabcef: **Detect open handles.** Pass `--detect-open-handles` (or set
  `detectOpenHandles: true` in `orquestra.config.ts`) to surface async
  resources — timers, sockets, watchers, file descriptors — that a feature
  opens but never closes. After each feature, the runner snapshots handles
  created during the feature that still keep the event loop alive
  (`hasRef()`), prints them to stderr with file:line and source, and serializes
  the same payload into `artifact.json`:

  - per feature, under `features[].openHandles`,
  - aggregated under `summary.featuresWithOpenHandles` and
    `summary.totalOpenHandles` (only when detection was on, so consumers
    don't read `0` as "verified zero leaks").

  Diagnostic only — leaks never fail the run. CLI flag wins over config;
  `--no-detect-open-handles` force-disables. Cost is real (`async_hooks`
  captures stack traces for every async resource), so leave it off for
  normal runs.

  New public types in `@orquestra/core`: `ArtifactOpenHandle`,
  `ArtifactOpenHandleFrame`, plus the optional `openHandles` /
  `featuresWithOpenHandles` / `totalOpenHandles` fields on existing
  `ArtifactFeature` / `ArtifactSummary`. New optional `detectOpenHandles?:
boolean` on `OrquestraConfig`. All additive — no breaking changes.

## 3.1.0

### Minor Changes

- Macros invoked through the BDD DSL now receive the accumulated scenario context as the second argument of `execute`, and any object they return is merged into the scenario context for the following steps — the same semantics inline steps already had.

  This lets scenarios compose narrative givens without exploding the macro registry across state combinations:

  ```ts
  const persistUser = defineMacro<{ persistedUser: User }, { user: User }>({
    title: "that user is persisted in the database",
    execute: async (ctx, { user }) => {
      const persistedUser = await ctx.get(UserService).create(user);
      return { persistedUser };
    },
  });

  feature
    .scenario("...")
    .given("there is a user registered in database")    // → { user }
    .given("that user is persisted in the database")    // reads { user }, adds { persistedUser }
    .given("that user logs in")                          // reads { user }, adds { token }
    .when(...);
  ```

  Backwards compatible: macros that don't read or contribute context (e.g. `cleanDatabaseMacro`) keep working unchanged. When a macro throws, the error message is now prefixed with `[macro "<title>"]` so failures are easier to trace.

## 3.0.0

### Minor Changes

- **Attachments & logs (`attach` / `log`).** Two top-level helpers exported
  from `@orquestra/core` for binding diagnostics to the running step:

  ```ts
  import { attach, log } from "@orquestra/core";

  scenario.when("ai answers", async ({ user }) => {
    const r = await ai.chat({ user: user.id });
    attach({ name: "AI response", type: "markdown", data: r.text });
    attach({ name: "Tool calls", type: "json", data: r.toolCalls });
    log("model", r.model);
    log("token_cost", r.usage);
  });
  ```

  - Five attachment types: `text`, `markdown`, `json`, `image`, `file`.
  - Inline storage in `artifact.json` for small payloads; binaries and
    oversized text/json spill to `outputDir/attachments/<scenarioId>/`,
    referenced by relative path on the step.
  - Each `ArtifactAttachment` and `ArtifactLog` carries an ISO `timestamp`
    so viewers can interleave them chronologically inside a step.
  - New `OrquestraConfig.inlineThresholdBytes` (default 50 KB).
  - New types: `AttachmentInput`, `AttachmentType`, `AttachmentEvent`,
    `ArtifactAttachment`, `ArtifactLog`. `StepEvent` and `ArtifactStep`
    gain optional `attachments` and `logs` fields (non-breaking).
  - Console reporter now appends `[N attachments, M logs]` per step.
  - **Rules:** call `attach` / `log` only inside a step callback, and
    `await` every async branch the step touches. Calls outside throw
    `attach()/log() must be called inside a step or hook callback`;
    fire-and-forget calls that resolve after the step ends throw
    `called after step "X" finished`.
  - Hook support (`beforeEachScenario` / `afterEachScenario` etc.) is
    not in this release — diagnostics from a failed scenario must be
    captured inside the step itself for now.

  See `packages/core/README.md` for the full reference.

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

## 0.2.0

### Minor Changes

- added bdd API and macros support

## 0.1.0

### Minor Changes

- add provision and deprovision methods to bootstrap manager and Orquestra

## 0.0.2

### Patch Changes

- fixed: typings, imports and build worflow

## 0.0.1

### Patch Changes

- 95a5546: added: Orquestra core, adapter express and adapter fastify
