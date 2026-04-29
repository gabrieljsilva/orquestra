# @orquestra/vitest

## 3.0.0

### Major Changes

- **Initial release.** Vitest bridge for Orquestra — write code-first BDD
  scenarios in unit and integration tests using the same chained DSL as
  `@orquestra/core`.

  ```ts
  import { defineFeature } from "@orquestra/vitest";

  const calc = defineFeature("Calculator");

  calc.scenario("adds two positives")
    .given("a calculator", () => ({ c: new Calculator() }))
    .when("I add 2 and 3", ({ c }) => ({ result: c.add(2, 3) }))
    .then("returns 5", ({ result }) => expect(result).toBe(5));
  ```

  Public surface:

  - **`defineFeature(name, options?)`** — same name as `@orquestra/core` so
    `const f = defineFeature(...)` doesn't shadow the import. Persona
    narrative (`as` / `I` / `so`) and `domain` are optional and accept
    any string — unit tests don't have to enumerate themselves in
    `orquestra.spec.ts`.
  - **`configure(options?)`** — optional. Initializes the per-file
    `WorkerOrquestra` with the same `modules` / `services` / `macros` /
    `env` shape as `orquestra test`'s worker config. `httpServer` is
    rejected — unit/integration shouldn't boot HTTP. Pure unit tests
    with no dependencies skip `configure()` entirely.
  - **`runFeatures()`** — translates declared features into Vitest
    `describe` / `it` and wires `beforeAll` / `afterAll` for the
    file-scope `boot()` / `shutdown()` lifecycle.

  Plugin entry — **`@orquestra/vitest/plugin`**:

  - **`orquestraVitest()`** — Vite plugin that auto-injects
    `runFeatures()` at the end of any spec file importing from the
    bridge. Files that already call `runFeatures()` explicitly are
    passed through untouched, so both styles co-exist. Shipped as both
    ESM and CJS so it loads whether `vite.config.js` is loaded as ESM
    or CJS.

  Reuses everything from `@orquestra/core` that makes sense in a
  single-process Vitest context: `attach` / `log` (kept in memory only —
  no `artifact.json`, no spillover), hooks (`beforeEachScenario` /
  `afterEachScenario` / `beforeEachFeature` / `afterEachFeature` /
  server-lifecycle hooks), services (`orquestra.get(...)`), macros and
  `defineModule`. The bridge is **read-only on the filesystem** by
  design — it never writes artifacts, never invokes reporters, never
  spills attachments to disk. Side-by-side with `orquestra test`
  without interference.

  Versioned at 3.0.0 to align with the Orquestra `fixed` package group.
  Pairs with `@orquestra/core@3.0.0`. Vitest is a peer dependency
  (`>=2.0.0`). See `packages/vitest/README.md` for the full guide.
