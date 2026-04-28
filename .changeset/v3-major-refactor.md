---
"@orquestra/core": major
"@orquestra/runner": major
"@orquestra/adapter-express": major
"@orquestra/adapter-fastify": major
---

# Orquestra v3.0 — major refactor

Major breaking release focused on simplifying the public API and making the
runtime deterministic. The repo's [`README.md`](../README.md) covers the
v3 surface (config shape, hooks, time budgets, debugging, security notes);
release notes on GitHub will carry the full side-by-side breaking-change
list when v3 ships.

## Highlights

- **`Orquestra` class split** into `GlobalOrquestra` (main process, manages
  containers via `provision`/`deprovision`) and `WorkerOrquestra` (per-file
  inside workers, owns http server + services + macros + modules via
  `boot`/`shutdown`).
- **Three-phase deterministic lifecycle**: `resolve` (sync, instantiates
  components and populates the macro registry) → `boot` (async, runs
  `onStart`) → `teardown` (async, mirror of boot). No lazy resolution
  anywhere — macros are available at file-import time.
- **Function-based component declaration**:
  - `defineMacro({ title, execute })` replaces the `OrquestraMacro` class.
  - `defineModule({ services, macros, containers, modules, ...hooks })`
    replaces `OrquestraPlugin`. Modules can compose recursively and declare
    lifecycle hooks that activate when the module is included.
  - `defineFeature(name, definition)` exported as a top-level function
    (Vitest-style) alongside the existing `orquestra.feature` facade.
- **`OrquestraHelper` removed.** Helpers were always just `Injectable` with
  a different name; pre-server work now lives in a service + a
  `beforeStartServer` hook (typically declared inside a module).
- **Hook scopes expanded** from 5 to 7:
  - file scope: `beforeStartServer`, `afterStartServer`, `beforeStopServer`
  - feature scope (new): `beforeEachFeature`, `afterEachFeature`
  - scenario scope (renamed): `beforeEachScenario`, `afterEachScenario`
    (was `beforeEach` / `afterEach`)
  - sugar: `useEnv({...})`
- **Free-function exports** for hooks and `defineFeature` from
  `@orquestra/core` — the `orquestra` facade object is still exported and
  works as before.
- **Config shape**: only `{ global, worker }` is supported. The flat shape
  (`{ httpServer, plugins, helpers, ... }` at the root) is removed.
- **HTML reporter removed.** `artifact.json` remains the canonical output;
  build a custom reporter on top of that schema if you need a UI.
- **Single-process `Runner` removed.** `ParallelRunner` is used regardless
  of concurrency (one worker is spawned when `concurrency=1`).
- **Type generator** detects `defineMacro(...)` calls via TS AST and emits
  `import type { macroIdentifier }` + `typeof macroIdentifier` — autocomplete
  for `.given("title")` works the same as before.
- **`process.env` snapshot/restore** between feature files (carried over
  from v2.next) — env mutations no longer leak across files in a worker.
- **Per-file Orquestra instances** (carried over from v2.next) —
  `onStart`/`onTeardown` of services/macros run once per file, with
  in-memory state isolated.

## Required tsconfig change

After upgrading, include the generated `.d.ts` in your project's
`tsconfig.json` so the IDE picks up macro/persona/domain autocomplete:

```jsonc
{
  "include": ["**/*.ts", ".orquestra/**/*.d.ts"]
}
```

If your config excludes `__tests__/` (common in NestJS templates), remove
that exclude — the TS server needs to see macro source files for context
inference. Production builds typically use a separate `tsconfig.build.json`
that keeps `__tests__/` excluded.

The full breaking-change list will live on the v3 GitHub release notes
when v3 is published.
