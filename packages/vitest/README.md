# `@orquestra/vitest`

Vitest bridge for [Orquestra](https://github.com/gabrieljsilva/orquestra) —
write **code-first BDD scenarios** in unit and integration tests, with the
same `defineFeature` / `given` / `when` / `then` chain you already use in
E2E, plus full access to Orquestra's services, modules, macros, hooks and
`attach` / `log` diagnostics.

The bridge **rides on top of Vitest** — it doesn't replace your test
runner. Each Orquestra feature becomes a Vitest `describe`, each
scenario becomes an `it`, and Vitest handles parallelism, watch mode,
coverage, and snapshot. You keep the entire Vitest ecosystem; you just
gain the structured BDD authoring style.

---

## When to use this vs `orquestra test`

| Test level | Runner | Why |
|---|---|---|
| **Unit** | `vitest` + this bridge | Fast, single-process, no testcontainers. Mock with `vi.fn()` / `vi.spyOn()`. |
| **Integration (light)** | `vitest` + this bridge | In-memory or pre-built dependencies via Orquestra modules. No HTTP server. |
| **Integration (real infra) / E2E** | `orquestra test` | Real testcontainers, real HTTP server, worker-isolated parallelism. |

If your test needs a real Postgres / RabbitMQ / Keycloak container, use
`orquestra test` — `GlobalOrquestra` (main process) provisions containers
once and shares them across worker-scoped instances. Vitest doesn't have
that lifecycle, so reproducing it via the bridge would mean booting
containers per-file (slow). Pick the right tool per level.

---

## Quickstart

```bash
npm install -D @orquestra/vitest @orquestra/core vitest
```

Add the plugin to your Vite/Vitest config (one-time, zero ceremony per spec):

```ts
// vitest.config.ts (or vite.config.js)
import { orquestraVitest } from "@orquestra/vitest/plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [orquestraVitest()],
  test: { include: ["src/**/*.spec.ts"], globals: true },
});
```

Write spec files using the same chained DSL you already know from
`@orquestra/core`:

```ts
// src/utils/group-by.spec.ts
import { defineFeature } from "@orquestra/vitest";
import { groupBy } from "./group-by";

const f = defineFeature("groupBy");

f.scenario("groups items by a string key")
  .given("a list of users with role tags", () => ({
    users: [
      { id: 1, role: "admin" },
      { id: 2, role: "user" },
      { id: 3, role: "admin" },
    ],
  }))
  .when("I group them by role", ({ users }) => ({
    result: groupBy(users, (u) => u.role),
  }))
  .then("each role bucket contains the matching users", ({ result }) => {
    expect(result.admin).toHaveLength(2);
    expect(result.user).toHaveLength(1);
  });

f.scenario("returns an empty object for an empty input")
  .when("I group an empty array", () => ({
    result: groupBy<{ id: number }>([], (x) => x.id),
  }))
  .then("the result has no keys", ({ result }) => {
    expect(result).toEqual({});
  });
```

Run:

```bash
npx vitest --run
```

Vitest discovers your spec files, the plugin appends `runFeatures()`
during transform, the bridge translates each feature into Vitest's
`describe` / `it`, and the per-file `WorkerOrquestra` lifecycle
(`boot` → tests → `shutdown`) is wrapped by `beforeAll` / `afterAll`.

### Without the plugin

If you'd rather not add a plugin to your Vite config, you can call
`runFeatures()` manually at the end of each spec file. Both styles
co-exist — even with the plugin enabled, files that already call
`runFeatures()` are passed through untouched:

```ts
import { defineFeature, runFeatures } from "@orquestra/vitest";

const f = defineFeature("groupBy");
f.scenario("...").given(...).when(...).then(...);

runFeatures();   // explicit
```

---

## Public API

```ts
import { configure, defineFeature, runFeatures } from "@orquestra/vitest";
```

| Symbol | Form | Purpose |
|---|---|---|
| `configure(options?)` | function | **Optional.** Initializes the per-file `WorkerOrquestra` with services, modules, macros, env. Skip it for pure unit tests — `defineFeature()` auto-inits an empty instance on first call. |
| `defineFeature(name, options?)` | function | Declares a feature. Mirrors the same name from `@orquestra/core`, so the `const f = defineFeature(...)` pattern works without shadowing the import. Persona narrative (`as` / `I` / `so`) and `domain` are **optional** and accept any string — unit tests don't have to enumerate themselves in `orquestra.spec.ts`. |
| `runFeatures()` | function | Translates declared features into Vitest `describe` / `it` and wires up `beforeAll`/`afterAll`. Last line of the file — or omit when using the plugin. |
| `ConfigureOptions` | type | Same as `WorkerOrquestraOptions` minus `httpServer`. |
| `FeatureOptions` | type | Standalone authoring shape — all fields optional, `as` / `domain` are plain `string` (not the registry-typed unions). |

### Plugin entry — `@orquestra/vitest/plugin`

```ts
import { orquestraVitest } from "@orquestra/vitest/plugin";
```

| Symbol | Purpose |
|---|---|
| `orquestraVitest(options?)` | Vite plugin. Auto-injects `runFeatures()` at the end of any spec file that imports from `@orquestra/vitest` and doesn't already call it. Default include: `*.{spec,test,feature}.{ts,tsx,mts,cts,js,jsx}`. |
| `OrquestraVitestPluginOptions` | Plugin config type. `include?: RegExp` overrides the default file pattern. |

Re-export anything else you need from `@orquestra/core` directly:

```ts
import { attach, log, beforeEachScenario, afterEachScenario, orquestra } from "@orquestra/core";
```

---

## What the bridge does NOT do (and won't ever)

The bridge is **read-only on the filesystem** by design. It will never:

- write `artifact.json` (or any other file) — `outputDir` isn't even read.
- invoke `OrquestraConsoleReporter` or any other reporter — `reporters`
  lives on `OrquestraConfig` (the runner's config), and `ConfigureOptions`
  doesn't extend that type. The bridge has no way to instantiate them.
- spill `attach()` payloads to disk — the spillover lives in
  `@orquestra/runner` and is not imported here. Attachments emitted from a
  unit test stay in memory on the in-process `StepEvent` and are
  discarded when the test process exits.
- touch your E2E `outputDir`. There is no shared state between
  `orquestra test` (E2E) and `vitest` (unit/integration via this bridge);
  they can run side by side without interfering.

If you need to inspect attachments or persist test output for unit
tests, do it explicitly inside a step (`console.log` it, write a file
from the test code, etc.). The framework deliberately does not emit
anything for you — unit tests are meant to be ephemeral.

---

## What works (and what doesn't)

| Primitive | Bridge | Notes |
|---|---|---|
| `defineFeature` / `scenario` / `given` / `when` / `then` | ✅ | Identical chain DSL. Type inference between steps is preserved. |
| `attach({ name, type, data })` / `log(label, value)` | ✅ | Same singleton mechanism. Values are kept in memory only and discarded when the test process exits — no `artifact.json`, no disk spillover. |
| `defineModule({ services, macros, ... })` | ✅ | Pass to `configure({ modules: [...] })`. Same module instance can be reused across unit / integration / E2E by pointing each level at a different config. |
| `defineMacro({ title, execute })` | ✅ | Pass to `configure({ macros: [...] })`. `.given("macro title")` resolves the same way as in E2E. |
| `OrquestraService` (with `onStart` / `onTeardown`) | ✅ | Lifecycle runs inside the file-scope `beforeAll` / `afterAll`. |
| `orquestra.get(MyService)` | ✅ | IoC works identically. |
| `useEnv({ KEY: "value" })` | ✅ | Same env override mechanism. |
| `beforeEachScenario` / `afterEachScenario` | ✅ | Mapped to Vitest `beforeEach` / `afterEach` per `describe`. |
| `beforeEachFeature` / `afterEachFeature` | ✅ | Mapped to Vitest `beforeAll` / `afterAll` per `describe`. |
| `beforeStartServer` / `afterStartServer` / `beforeStopServer` | ✅ | Run during file-scope `boot()` / `shutdown()`. Useful when modules require server-lifecycle hooks. |
| `httpServer` adapter | ❌ | Rejected at `configure()` time. Unit/integration shouldn't boot HTTP — use `orquestra test` for that. |
| `global.containers` / `beforeProvision` / `afterProvision` | ❌ | Testcontainer lifecycle belongs to `GlobalOrquestra` (main process). Use `orquestra test` or Vitest `globalSetup` if you need them. |

---

## Reusing the same modules in unit, integration, and E2E

The big win — modules and macros are agnostic to the test level. The same
`databaseModule` can declare a real Postgres service in your E2E config
and an in-memory mock in your unit config:

```ts
// modules/database.real.module.ts (used in orquestra.config.ts for E2E)
export const databaseModule = defineModule({ services: [PostgresService] });

// modules/database.mock.module.ts (used in unit configure())
export const mockDatabaseModule = defineModule({ services: [InMemoryDbService] });

// macros/clean-database.macro.ts (used everywhere)
export const cleanDatabaseMacro = defineMacro({
  title: "there is a clean database",
  execute: ({ get }) => get(DatabaseService).clean(),    // works with either implementation
});
```

The macro doesn't care which `DatabaseService` is registered — it just
calls `.clean()`. Swap the module per level, keep the test code identical.

---

## Plugin reference — `@orquestra/vitest/plugin`

The plugin is a Vite transform that finds spec files importing from
`@orquestra/vitest` and appends a single `runFeatures()` call at the
end if it isn't already there. That's it — nothing else.

```ts
import { orquestraVitest } from "@orquestra/vitest/plugin";

orquestraVitest({ include: /\.bdd\.ts$/ });   // custom pattern
```

| Behavior | Triggers |
|---|---|
| Append `runFeatures()` at end | File matches `include` AND imports `@orquestra/vitest` AND doesn't already call `runFeatures()` |
| Pass through (no transform) | File doesn't match `include`, doesn't import the bridge, or already calls `runFeatures()` |

The plugin is shipped in **both ESM and CJS** so it works whether your
`vite.config.js` is loaded as ESM (project has `"type": "module"`) or
CJS (default for `.js` without that flag). The runtime bridge stays
ESM-only — Vitest is ESM-only and doesn't accept `require()`.

---

## Why an explicit `runFeatures()` at the end?

Vitest collects `describe` / `it` **synchronously** during module load.
Orquestra's chain DSL (`.scenario(...).given(...).when(...).then(...)`)
adds steps **after** the `defineFeature(...)` call returns, so
registering `describe` / `it` from inside `defineFeature(...)` would
happen before the scenarios are attached.

`runFeatures()` is the explicit "I'm done declaring, register everything
now" signal. The plugin just automates that one call so spec authors
don't have to think about it — the underlying mechanic is identical.

---

## Reference

- Bridge source: `packages/vitest/src/`
- Core API used: `WorkerOrquestra`, `BddRunner`, `initOrquestra`, `getOrquestraInstance`
- See [`@orquestra/core` README](../core/README.md) for `attach` / `log` rules and the artifact schema.
