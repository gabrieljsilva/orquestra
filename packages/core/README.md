# `@orquestra/core`

The BDD engine, IoC container and lifecycle primitives that power Orquestra.

For the user-facing overview, see the [root README](../../README.md).
For migration from v2.x, see [`MIGRATION.md`](../../MIGRATION.md).

---

## What this package exposes

### Component authoring

| Symbol | Form | Purpose |
|---|---|---|
| `defineModule({ services, macros, containers, modules, ...hooks })` | function | Aggregator with optional shared hooks |
| `defineMacro({ title, execute })` | function | Reusable BDD step looked up by title |
| `defineFeature(name, definition)` | function | Top-level feature declaration (Vitest-style import) |
| `defineConfig(...)` | function | Type helper for `orquestra.config.ts` |
| `defineSpec(...)` | function | Type helper for `orquestra.spec.ts` |
| `OrquestraService` | class | Base for injectable services with state and API |
| `OrquestraContainer<T>` | class | Base for testcontainer wrappers |

### Lifecycle hooks (file scope)

```ts
import {
  beforeStartServer,
  afterStartServer,
  beforeStopServer,
  beforeEachFeature,
  afterEachFeature,
  beforeEachScenario,
  afterEachScenario,
  useEnv,
} from "@orquestra/core";
```

The same names are also available on the `orquestra` facade
(`orquestra.beforeStartServer(...)`).

### Worker / global instances

| Symbol | Use |
|---|---|
| `WorkerOrquestra` | per-file instance inside a worker. Owns http server, services, macros, modules. |
| `GlobalOrquestra` | main process instance. Owns containers (provision/deprovision). |
| `initOrquestra(opts)` | sets the singleton consumed by free-function hooks and `orquestra.feature`. Called by the runner per file. |
| `getOrquestraInstance()` | returns the current singleton. |
| `resetOrquestraInstance()` | clears the singleton — required between files. |
| `orquestra` | facade with `feature`, `http`, `get`, plus all hooks. |

### Three-phase lifecycle

```
new WorkerOrquestra(opts)
   └─ Phase 1 (sync): resolve modules, instantiate services, populate macro registry

await worker.boot()
   └─ Phase 2 (async): beforeStartServer → http listen → services.onStart → macros.onStart → afterStartServer

(per feature, per scenario)

await worker.shutdown()
   └─ Phase 3 (async, reverse): beforeStopServer → macros.onTeardown → services.onTeardown → http close
```

See [`lifecycle.md`](../../lifecycle.md) for the full sequence diagram.

### Reporters

```ts
import { OrquestraReporter, OrquestraConsoleReporter } from "@orquestra/core";
```

The HTML reporter was removed in v3 — build a custom reporter on top of
`artifact.json` if you need a UI.

### Types you'll touch

```ts
export type { HookFn, HookContext, HookKind } from "@orquestra/core";
export type { MacroDefinition, ModuleDefinition } from "@orquestra/core";
export type { OrquestraArtifact, ArtifactFeature, ArtifactScenario } from "@orquestra/core";
export type { OrquestraConfig, GlobalOrquestraOptions, WorkerOrquestraOptions } from "@orquestra/core";
```

---

## Asserts: bring your own

Orquestra is **assertion-agnostic** by design. The `BddRunner` wraps each
step in `try { await step.fn(ctx) } catch (err) { ... }` — anything that
throws becomes a failed step, and `error.message` / `error.stack` flow into
`artifact.json`. The framework neither ships nor requires a matcher
library.

Pick what fits your project:

| Library                | Style                      | Notes                                                                                       |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `node:assert/strict`   | `assert.strictEqual(a, b)` | Zero-dep, in the standard library, fine for 90% of E2E checks. Default in the playground.  |
| `@vitest/expect`       | `expect(a).toBe(b)`        | Jest-style, deep diff, `expect.any` / `toMatchObject`. Standalone — does not pull Vitest in. |
| `expect@29`            | `expect(a).toBe(b)`        | Jest's matcher package as a standalone npm dependency.                                      |
| `chai` (+ `chai-as-promised`) | `expect(a).to.equal(b)` | Fluent, mature, async resolvers when paired with the plugin.                          |
| `should.js`, `uvu/assert`, `tape` | various          | Work too — any lib that throws on failure.                                                  |

```ts
// node:assert/strict (zero-dep)
import { strictEqual } from "node:assert";

scenario.then("returns 200", (ctx) => {
  strictEqual(ctx.response.status, 200);
});

// @vitest/expect (jest-style)
import { expect } from "@vitest/expect";

scenario.then("returns the user", (ctx) => {
  expect(ctx.response.status).toBe(200);
  expect(ctx.response.body).toMatchObject({ id: expect.any(String) });
});
```

### Caveats

- **Async resolvers** (`await expect(promise).resolves.toBe(...)`) depend
  on the library — `@vitest/expect` and `chai-as-promised` support it,
  `node:assert` does not. Not an Orquestra concern.
- **Mocks are a separate package.** `vi.fn()` needs `@vitest/spy`,
  `jest.fn()` needs `jest-mock`. For E2E suites that hit real HTTP / DB /
  brokers (the case Orquestra targets), you typically don't need mocks at
  all.
- **`toMatchSnapshot()` is not integrated.** The snapshot store lives in
  Vitest/Jest's runner, not in your matcher lib. Manual string snapshot
  comparison works; rich snapshot testing does not (yet — a future
  artifact-aware version may land).
- **Custom matchers** (`expect.extend({ toBeMyDomainThing })`) work
  normally — they're side effects on the matcher lib, Orquestra has no
  opinion.

The takeaway: pick the matcher style your team likes, keep it consistent,
and don't expect Orquestra to own this part of the stack.

---

## Running subprocesses from hooks

Hooks frequently shell out — `prisma migrate deploy`, `redis-cli flushall`,
`docker exec`, custom scripts. Orquestra hooks run in the **main Node
process** (or in a worker, depending on scope), not under `pnpm`/`npm`.
That has one consequence developers stumble into:

> **`node_modules/.bin/` is NOT in `process.env.PATH`** when a hook calls
> `child_process.execSync` / `spawn`.

The hook itself can resolve a binary by absolute path. But if that binary
**transitively spawns another tool by name** — and that tool only lives in
`node_modules/.bin/` — the inner spawn fails with `ENOENT`. Classic
example: `prisma db seed` resolves fine, but it then `spawn("ts-node", ...)`
which is not in PATH.

Three patterns that work:

1. **Absolute paths or `pnpm`-prefixed commands**:
   ```ts
   execSync("./node_modules/.bin/prisma migrate deploy", { ... });
   ```

2. **Patch the `PATH` for the subprocess**:
   ```ts
   import path from "node:path";

   const env = {
     ...process.env,
     PATH: `${path.resolve("node_modules/.bin")}${path.delimiter}${process.env.PATH}`,
   };
   execSync("prisma db seed", { env });
   ```

3. **Skip the subprocess entirely** when you control both ends. Orquestra
   already loads TypeScript via jiti — importing your seed/setup code
   directly is faster, debuggable, and dependency-free:
   ```ts
   import { runSeeds } from "src/infra/database/prisma/seeds";

   afterProvision: async (ctx) => {
     await runSeeds({ databaseUrl: templateUrl });
   }
   ```

Pattern 3 is the most enterprise-grade: zero PATH magic, zero extra
processes, and a step in your seed becomes a stoppable breakpoint inside
the same `--debug` session as the rest of the suite.

---

## Library mode

You can use `WorkerOrquestra` directly without the runner — useful for
embedding inside other harnesses. The runner is the canonical entry point;
library mode is a power-user escape hatch and is not covered here in detail.
