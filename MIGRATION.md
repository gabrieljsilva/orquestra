# Migration guide: v2.x → v3.0

v3 is a **major breaking release** focused on simplifying the public API and
making the runtime deterministic. The configuration, lifecycle and component
authoring all changed. There is no compatibility shim — every project will
need migration.

If you are still on v0.x or v1.x, see the archived guide at
[`docs/migration/v0-to-v1.md`](./docs/migration/v0-to-v1.md) first.

---

## TL;DR — what changed

| Concern | v2.x | v3.0 |
|---|---|---|
| Top-level class | `Orquestra` (single, mixed concerns) | `GlobalOrquestra` (containers, main process) + `WorkerOrquestra` (everything else, per-file) |
| Plugins | `class extends OrquestraPlugin` | **Removed.** Use `defineModule({ services, macros, ... })` |
| Helpers | `class extends OrquestraHelper` | **Removed.** Use a `Service` + a hook, declared in a module |
| Macros | `class extends OrquestraMacro<T>` | `defineMacro({ title, execute })` |
| Modules / aggregation | `plugin.onStart()` calling `ctx.registerServices(...)` | `defineModule({ services, macros, modules, ...hooks })` |
| Config shape | flat (`{ httpServer, plugins, helpers, ... }`) **or** `{ global, worker }` | only `{ global, worker }` |
| Lifecycle hooks | 5 hooks (`beforeStartServer`, `afterStartServer`, `beforeEach`, `afterEach`, `beforeStopServer`) | 7 hooks: same plus `beforeEachFeature`/`afterEachFeature`. `beforeEach`/`afterEach` renamed to `beforeEachScenario`/`afterEachScenario`. |
| Hook scopes | file only | file + feature + scenario |
| HTML reporter | shipped (`OrquestraHtmlReporter`) | **Removed.** Build a custom reporter from `artifact.json` if needed |
| Runner modes | single-process (`Runner`) + parallel (`ParallelRunner`) | parallel only (concurrency=1 still works) |
| Macro registry | lazy + `populateMacroRegistry` workaround | eager during `WorkerOrquestra` construction |
| Bootstrap | mixed register + onStart in single `start()` | three named phases: `resolve` (sync) → `boot` (async) → `teardown` (async) |
| Scenario runner | `node:test` (filtered reporter, leaked metadata across files) | own runner (`scenario-runner`) using `withTimeout` from `@orquestra/core` |
| Timeouts | one knob (`timeout`) shared by everything | three knobs: `scenarioTimeoutMs` (5s), `eachHookTimeoutMs` (10s), `serverHookTimeoutMs` (60s); per-feature/per-scenario overrides |
| Memory cap per worker | not available | opt-in `workerMemoryLimitMb` — manager drains and respawns workers gracefully |
| Global config-time hooks | not available | `beforeProvision`/`afterProvision`/`beforeDeprovision`/`afterDeprovision` declared in `global` |

---

## 1. Split `Orquestra` into `GlobalOrquestra` + `WorkerOrquestra`

`Orquestra` is gone. Two scoped classes replace it.

**Before (v2):**

```ts
import { Orquestra, initOrquestra, resetOrquestraInstance } from "@orquestra/core";

resetOrquestraInstance();
const orq = initOrquestra({
  containers: [PgContainer],
  httpServer: () => makeApp(),
  plugins: [AuthPlugin],
  // ...
});
await orq.start();
// ...
await orq.teardown();
```

**After (v3):**

The runner does this for you. If you embed Orquestra programmatically:

```ts
// in the main process — containers only
import { GlobalOrquestra } from "@orquestra/core";

const global = new GlobalOrquestra({ containers: [PgContainer] });
await global.provision();
// ... spawn workers ...
await global.deprovision();
```

```ts
// in a worker (per file) — http server, services, macros, modules
import { WorkerOrquestra, initOrquestra, resetOrquestraInstance } from "@orquestra/core";

resetOrquestraInstance();
const worker = initOrquestra({
  httpServer: () => makeApp(),
  modules: [authModule, databaseModule],
  macros: [cleanDatabaseMacro],
});
await worker.boot();      // was: orq.start({ skipContainers: true })
// ... run features ...
await worker.shutdown();  // was: orq.teardown({ skipContainers: true })
```

`OrquestraOptions` and `OrquestraBootstrapOptions` are gone. Use
`GlobalOrquestraOptions` / `WorkerOrquestraOptions`. `skipContainers` no
longer exists — the split makes it impossible to confuse the scopes.

---

## 2. Plugins, Helpers → Modules + Services

`OrquestraPlugin` and `OrquestraHelper` are removed. Their roles split:

- **Aggregation / registration** (the "module" role plugins played) → `defineModule`.
- **Pre-server side effects** (the "helper" role) → a `Service` + a hook.
- **Public API** (the "service" role both classes occasionally played) → `Service`.

### Old plugin → `defineModule`

**Before (v2):**

```ts
// auth.plugin.ts
export class AuthPlugin extends OrquestraPlugin implements OnStart {
  async onStart() {
    this.ctx.registerServices([AuthService, TestAuthService]);
  }
}

// orquestra.config.ts
plugins: [AuthPlugin],
```

**After (v3):**

```ts
// modules/auth/auth.module.ts
import { defineModule } from "@orquestra/core";

export const authModule = defineModule({
  services: [AuthService, TestAuthService],
});

// orquestra.config.ts
worker: {
  modules: [authModule],
},
```

### Old helper → `Service` + hook in the module

`OrquestraHelper` always inherited from `Injectable` with no extras. Its
defining trait was timing: helpers ran their `onStart` before the http server
booted. In v3, **hooks own timing**. A "helper" becomes a regular `Service`
whose work is invoked from a `beforeStartServer` hook declared in the module.

**Before (v2):**

```ts
// helpers/worker-isolation.helper.ts
export class WorkerIsolationHelper extends OrquestraHelper implements OnStart {
  async onStart() {
    const env = this.ctx.container.get(EnvHelper);
    env.override("DATABASE_URL", computeWorkerScopedUrl());
  }
}

// orquestra.config.ts
helpers: [WorkerIsolationHelper],
```

**After (v3):**

```ts
// modules/isolation/worker-isolation.service.ts
export class WorkerIsolation extends OrquestraService {
  setup() {
    const env = this.ctx.container.get(EnvHelper);
    env.override("DATABASE_URL", computeWorkerScopedUrl());
  }
}

// modules/isolation/isolation.module.ts
export const isolationModule = defineModule({
  services: [WorkerIsolation],
  beforeStartServer: (ctx) => ctx.get(WorkerIsolation).setup(),
});

// orquestra.config.ts
worker: {
  modules: [isolationModule],
},
```

The module bundles the service with the hook that activates it. Importing the
module activates both atomically.

### `ctx.registerServices`/`registerMacros`/`registerHelpers` removed at runtime

In v2, plugins mutated the context inside `onStart`. In v3 the resolution
phase is sealed at construction time. **Registration must happen via config
or via `defineModule`.** Plugins that registered services/macros from
`onStart` will not work — translate them to a module that lists those
services/macros directly.

---

## 3. Macros — `defineMacro` instead of class

```ts
// Before (v2)
export class LoginMacro extends OrquestraMacro<LoginContext> {
  override title = "I just signed in for the very first time";
  async execute(loginDto?: LoginDto): Promise<LoginContext> {
    const keycloak = this.ctx.container.get(KeycloakService);
    // ...
    return { accessToken, loggedUserEmail };
  }
}

// After (v3)
import { defineMacro } from "@orquestra/core";

export const loginMacro = defineMacro<LoginContext, LoginDto | undefined>({
  title: "I just signed in for the very first time",
  execute: async (ctx, loginDto) => {
    const keycloak = ctx.get(KeycloakService);
    // ...
    return { accessToken, loggedUserEmail };
  },
});
```

- `ctx` (first arg) is the same `HookContext` exposed to lifecycle hooks
  (`{ env, http, get, container }`). Replaces the `this.ctx` of the class
  form.
- The second arg `input` is whatever the calling step would provide. For
  scenarios that just reference the macro by title (`.given("...")`), the
  second arg defaults to `void`/the accumulated scenario context.
- The `title` must remain a literal string (the type generator parses it via
  AST — no template expressions or const references).

The class form is **removed**. Existing macros must be migrated to the
function form.

### Type generation (`orquestra types`)

The macro extractor now looks for `defineMacro(...)` calls instead of class
declarations. The generated `.d.ts` switches from `import type X` to
`import X` plus `typeof X`, but the consumer experience is identical —
autocomplete on `.given("...")` works the same way.

---

## 4. Hooks — renamed and expanded

| v2 | v3 | Scope |
|---|---|---|
| `beforeStartServer` | `beforeStartServer` | file |
| `afterStartServer` | `afterStartServer` | file |
| — | **`beforeEachFeature`** | feature (new) |
| `beforeEach` | **`beforeEachScenario`** | scenario (renamed) |
| `afterEach` | **`afterEachScenario`** | scenario (renamed) |
| — | **`afterEachFeature`** | feature (new) |
| `beforeStopServer` | `beforeStopServer` | file |

Setup hooks run **FIFO**, cleanup hooks run **LIFO** — same rule as v2.

`beforeEachFeature`/`afterEachFeature` fire around each feature in the file
(useful when a file declares multiple features that share heavy setup).

`beforeEach`/`afterEach` are **removed**. Find-and-replace:

```bash
find . -name "*.feature.ts" -o -name "*.module.ts" | xargs sed -i \
  -e 's/orquestra\.beforeEach(/orquestra.beforeEachScenario(/g' \
  -e 's/orquestra\.afterEach(/orquestra.afterEachScenario(/g'
```

---

## 5. Functional exports (Vitest-style)

Hooks and `defineFeature` are now exported as top-level functions:

```ts
import {
  defineFeature,
  beforeStartServer,
  beforeEachScenario,
  afterEachScenario,
  useEnv,
} from "@orquestra/core";

beforeStartServer((ctx) => ctx.env.override("DEBUG", "*"));

const loginFeature = defineFeature("login", { /* meta */ });
loginFeature.scenario(/* ... */);
```

The `orquestra` facade object is still exported and works the same. Pick the
style you prefer — they're equivalent.

**Naming caveat:** importing `feature` collides with the common variable name
`const feature = ...`. Prefer `defineFeature` or alias on import.

---

## 6. Config shape — `global`/`worker` only

The flat shape (`{ httpServer, plugins, helpers, services, macros, containers }`
at the root) is removed.

**Before:**

```ts
defineConfig({
  httpServer: () => makeApp(),
  plugins: [...],
  helpers: [...],
  containers: [...],
});
```

**After:**

```ts
defineConfig({
  global: {
    containers: [PgContainer, RmqContainer],
  },
  worker: {
    httpServer: () => makeApp(),
    modules: [authModule, databaseModule],
    macros: [cleanDatabaseMacro],
  },
});
```

`worker.plugins` and `worker.helpers` are gone — use `worker.modules`.

---

## 7. HTML reporter removed

`OrquestraHtmlReporter` is no longer shipped. The `artifact.json` produced by
the runner remains the canonical machine-readable output; build any UI on
top of that.

If your config still references it, remove the import and the reporter entry.

---

## 8. Runner — `ParallelRunner` only

The single-process `Runner` is gone. `ParallelRunner` is used regardless of
concurrency (it spawns one worker when `concurrency=1`). The `npx orquestra
test` command is unchanged from a user perspective.

If you imported `Runner` directly, switch to `ParallelRunner` (same options
mostly — see `packages/runner/src/lib/runner/parallel-runner.ts`).

---

## 9. Bootstrap — three named phases

Internally the lifecycle is now explicit:

```
WorkerOrquestra construct
   └─ Phase 1: resolve (sync)
        • EnvHelper instantiated
        • Modules flattened (DFS)
        • Services instantiated (sync, eager) — registry hydrated
        • Macros registered in MacroRegistry
        • HTTP adapter NOT yet listening

await worker.boot()
   └─ Phase 2: boot (async)
        • beforeStartServer hooks (FIFO)
        • HttpServer.listen
        • Services.onStart (FIFO)
        • Macros.onStart (FIFO)
        • afterStartServer hooks (FIFO)

(per feature, per scenario — see lifecycle.md)

await worker.shutdown()
   └─ Phase 3: teardown (async, reverse)
        • beforeStopServer hooks (LIFO)
        • Macros.onTeardown (LIFO)
        • Services.onTeardown (LIFO)
        • HttpServer.close
```

Macros are now resolvable at file-import time without lazy fallback. The
old `MacroRegistry.populateMacroRegistry` and the BDD runner's lazy macro
lookup are gone.

`ctx.get(SomeService)` works inside `beforeStartServer` (services are eager
class-instantiated during Phase 1). FactoryProvider services are still
deferred to Phase 2 — call them via `await ctx.container.resolve(...)` in
hooks if needed.

---

## 10. Class-base for components

Devs author services and containers by extending base classes:

```ts
import { OrquestraService, OrquestraContainer } from "@orquestra/core";

export class KeycloakService extends OrquestraService {
  async createUser(input) {
    const env = this.ctx.container.get(EnvHelper);
    // ...
  }
}

export class PgContainer extends OrquestraContainer<StartedTestContainer> {
  containerName = "postgres";
  async up() { /* ... */ }
}
```

`OrquestraInjectable` is **not** exposed publicly to avoid confusion with
`@Injectable()` from NestJS (which is a decorator, different concept).

---

## 11. Behavioral changes that survived from v2.next

These were already true in v2.next and remain in v3 (documented here for
completeness):

- **Per-file Orquestra** — a fresh instance per feature file inside each
  hot worker. Plugins (now: services and modules) get their `onStart`/
  `onTeardown` invoked once per file, not once per worker.
- **`process.env` snapshot/restore** — the worker captures `process.env`
  on boot and restores it before processing each file. Mutations don't leak
  across files.
- **In-memory state** of services no longer leaks across files in the same
  worker — fresh instances each time.

### New in v3 — observable changes from the runtime overhaul

- **Scenarios that hang now fail with `TimeoutError`** at 5s (default).
  Previously the body could stay pending forever — `node:test` swallowed it
  and the run finished without any signal. If a scenario of yours relied on
  that "silent never-resolve" behavior, raise its budget explicitly.
- **Default hook budgets tightened.** Each-hooks went from 30s (single
  `timeout` knob) to 10s; server-hooks went the other way to 60s. Hooks
  that used to run between 10–30s on each-scope now fail unless the budget
  is overridden via `eachHookTimeoutMs`.
- **`node:test` reporter is gone.** The `silence-node-test` stdout filter
  was removed too. If you grep'd output lines starting with `✔`/`✖`/`▶`
  to detect the legacy reporter, those lines no longer appear.
- **Synthetic `<scenario body>` step on body failures.** When a scenario
  body errors without any step recording a `failed` event (most common
  cause: a step hung past the timeout), the worker emits a synthetic
  step event with `keyword: "Then"`, `stepName: "<scenario body>"`,
  `status: "failed"` so the artifact aggregates correctly. Reporters that
  iterate steps will see this extra entry on timed-out scenarios.

---

## 12. Timeouts — granular, with per-feature/per-scenario overrides

v2 had a single `timeout` knob that capped any lifecycle hook
(`onStart`/`onTeardown` and any registered hook). Scenarios had no time
budget at all — a hung step ran forever (or until you Ctrl-C'd).

v3 splits the budget into three named knobs and adds per-feature and
per-scenario overrides for the scenario one:

| Field                 | Default | Caps                                                                                                            |
| --------------------- | ------: | --------------------------------------------------------------------------------------------------------------- |
| `scenarioTimeoutMs`   |   5000  | Body of each scenario.                                                                                          |
| `eachHookTimeoutMs`   |  10000  | `before/afterEachScenario`, `before/afterEachFeature`.                                                          |
| `serverHookTimeoutMs` |  60000  | `beforeStartServer`, `afterStartServer`, `beforeStopServer`, plus service `onStart`/`onTeardown` and global hooks. |

**Before (v2):**

```ts
defineConfig({
  timeout: 30_000, // applied to every hook; scenarios had no timeout
  // ...
});
```

**After (v3):**

```ts
defineConfig({
  scenarioTimeoutMs: 5_000,
  eachHookTimeoutMs: 10_000,
  serverHookTimeoutMs: 60_000,
  // ...
});
```

### Per-feature override

```ts
import { defineFeature } from "@orquestra/core";

const slowFeature = defineFeature("slow integration", {
  as: "operator",
  I: "want to run a long-ish scenario",
  so: "...",
  timeoutMs: 30_000, // applies to every scenario in this feature
});
```

### Per-scenario override

```ts
slowFeature
  .scenario("regression: heavy report generation", { timeoutMs: 60_000 })
  .given(...)
  .when(...)
  .then(...);
```

Resolution priority is **scenario > feature > config default**. Setting any
of them to `0`, `Infinity` or omitting them (only the config field is
omittable) disables the timeout — same semantics as `withTimeout` exposed
from `@orquestra/core`.

When a scenario body times out:

- The `afterEachScenario` hook still runs (per-scenario teardown gets its
  chance — same contract as Vitest).
- Sibling scenarios in the same feature continue normally.
- The artifact records the timeout via the synthetic `<scenario body>`
  step described in §11.

### CLI fallback

The `--featureTimeout` flag (manager-level, kills a stuck worker per file)
defaults to `5 × max(serverHookTimeoutMs, eachHookTimeoutMs, scenarioTimeoutMs)`
when omitted. Override via `--featureTimeout=N` if your features need more.

---

## 13. Scenario runner — own runner, no more `node:test`

Internal change with one user-visible side effect (already covered in §11
and §12). Documented for context.

v2 wrapped each scenario body in `await test(name, fn)` from `node:test`.
That worked but had two problems:

1. **Memory leak in long-lived workers** — every `test()` call registers a
   node in `node:test`'s global root. A worker processing 1000+ features
   accumulated ~5.8 KB per scenario that GC could not collect.
2. **Reporter noise filtered with a regex hack** — the spec reporter from
   `node:test` printed `✔/✖/ℹ` lines that we then filtered from `stdout`
   via `silence-node-test`, which occasionally ate user logs that started
   with the same glyphs.

v3 ships a small `scenario-runner` (under 50 lines) that wraps the body in
`try/catch` + `withTimeout` (reused from `@orquestra/core`). The
`silence-node-test` filter is removed. Step events flow exactly like
before — `BddRunner` already pushes `success`/`failed` to `feature.getEvents()`,
the worker forwards them via IPC, the reporter consumes them.

You don't need to change anything in your features. If you imported
anything from `node:test` directly inside `.feature.ts` (you shouldn't have
needed to), nothing in Orquestra prevents it — but it has no effect on the
runner anymore.

---

## 14. Worker memory recycle — opt-in

Long-running workers (processing thousands of features or running heavy
user plugins) can leak memory in ways unrelated to Orquestra itself. v3
adds an optional graceful recycle:

```ts
defineConfig({
  workerMemoryLimitMb: 512, // soft cap (MB) per worker
  // ...
});
```

When configured:

1. After every `feature:done` / `feature:failed`, the worker reports its
   `process.memoryUsage().heapUsed` in the IPC message.
2. If `heapUsed >= workerMemoryLimitMb` and the queue still has pending
   features, the manager marks the worker as "draining", sends `shutdown`,
   and waits for it to exit cleanly (so the current feature finishes its
   teardown).
3. A fresh worker is spawned to continue the queue from where the recycled
   one left off. Pending features are preserved — none lost, none duplicated.

When **not** configured (default), the code path is byte-identical to the
previous behavior — no IPC overhead, no extra branches taken in the manager.

This is defense in depth: the M8 fix (§13) eliminates the `node:test` leak
itself; this knob protects against leaks in third-party code (jiti caches,
user services that hold references, native bindings).

---

## 15. Global config-time hooks

v2 exposed only worker-scoped hooks (`beforeStartServer`, etc., declared
inside `.feature.ts` or modules). The main process — where containers live
— had no extension points.

v3 adds four hooks declared inside `global` in `orquestra.config.ts`:

```ts
import { defineConfig, Postgres } from "@orquestra/core";

export default defineConfig({
  global: {
    containers: [postgres, keycloak, rabbit],

    afterProvision: async (ctx) => {
      // Containers are up. Do one-time global setup here:
      // create a Postgres "template" DB with migrations + seeds applied,
      // import a Keycloak realm, populate Redis fixtures, etc.
      const pg = ctx.container.get(Postgres);
      await pg.query("CREATE DATABASE test_template");
      await runMigrations(pg, "test_template");
      await runSeeds(pg, "test_template");
    },

    beforeDeprovision: async (ctx) => {
      // Workers are done; containers still up. Useful for collecting
      // dumps or saving state for debugging when the run failed.
    },
  },
  worker: { /* ... */ },
});
```

| Hook                | Timing                                  | On failure        |
| ------------------- | --------------------------------------- | ----------------- |
| `beforeProvision`   | Before testcontainers come up           | aborts the run    |
| `afterProvision`    | Containers up, before any worker forks  | aborts the run    |
| `beforeDeprovision` | After workers exit, before teardown     | logs and continues |
| `afterDeprovision`  | After containers are gone               | logs and continues |

Each accepts a single function or an array of functions. Setup-side hooks
abort on failure (a broken setup means the run is dead anyway); cleanup-side
hooks log and continue so containers always come down.

### `GlobalHookContext` is narrower than worker `HookContext`

The main process **does not own an HTTP server** — each worker boots its
own. The global hook context reflects this:

| Field             | Worker `HookContext` | `GlobalHookContext` |
| ----------------- | :------------------: | :-----------------: |
| `ctx.env`         |          ✓           |          ✓          |
| `ctx.container`   |          ✓           |     ✓ (global)      |
| `ctx.get(Token)`  |          ✓           |     ✓ (global)      |
| `ctx.http`        |          ✓           |       ✗ (n/a)       |

`ctx.container` in a global hook resolves to the **global IoC** — it sees
testcontainers (`Postgres`, `RabbitMQ`, `Keycloak`, …) declared in
`global.containers`. It does **not** see worker-scoped `services` or
`macros` (those live inside each worker's IoC).

Each global hook is bounded by `serverHookTimeoutMs` (default 60s).

### Why this matters: per-feature setup gets cheaper

The `afterProvision` hook is the right place for one-time work that every
worker depends on. The textbook case is **schema-template provisioning for
Postgres**:

1. `afterProvision`: `CREATE DATABASE test_template` + run migrations +
   seed once. Pay 2–5s, total.
2. Per-feature `beforeStartServer`: `CREATE DATABASE test_<id> WITH TEMPLATE
   test_template` — copies pages directly, ~50–200ms instead of re-running
   migrations every time.

Same idea applies to Keycloak realm import (do once globally; workers just
authenticate against it) and Redis fixtures (seed once; workers use a
namespaced key prefix).

---

## Security note: `artifact.json` may contain sensitive data

The runner serializes step and hook errors verbatim into `artifact.json`,
including `error.message` and `error.stack`. In practice this means:

- Absolute filesystem paths from worker stack traces (`/home/<user>/...`).
- Content of any error message constructed by your code or your dependencies.
  HTTP libraries (e.g. SuperTest) commonly echo request/response headers in
  assertion failure messages, including `Authorization` and `Cookie`.
- Connection strings if a driver throws with the URL embedded.

`artifact.json` is written under `outputDir` (defaults to `.orquestra/`) with
the process's default umask. It is **not** redacted by Orquestra.

**Treat `artifact.json` as potentially sensitive.** If you publish it as a
public CI artifact (GitHub Actions artifact, build dashboard, etc.), scrub
common header names beforehand or generate a separate sanitized export. A
configurable redaction hook may be added in a future minor release.

---

## tsconfig: include the generated `.orquestra/orquestra.d.ts`

TypeScript ignores files under dotfolders (`.foo/`) by default. The generated
`.orquestra/orquestra.d.ts` won't be picked up unless your `tsconfig.json`
includes it explicitly:

```jsonc
{
  "compilerOptions": { /* ... */ },
  "include": ["**/*.ts", ".orquestra/**/*.d.ts"]
}
```

Without this:
- `domain` / `as` autocomplete may *appear* to work in some IDEs (their own
  indexer picks up the file outside the TS project), but real type-checking
  via `tsc` won't see the augment.
- Macro context inference (`.given("title")` returning the right context)
  *will* fail — it depends on `typeof <macroIdentifier>` resolving through
  the TS server, which only works if the project includes the `.d.ts`.

If your `tsconfig.json` excludes `__tests__/` (common in NestJS templates),
remove that exclude — the TS server needs to see the macro source files for
the inference to chain through. Production builds typically use a separate
`tsconfig.build.json` that keeps `__tests__/` excluded.

---

## Appendix — Mechanical migration script

The following shape covers most cases. Adjust paths to your project layout.

```bash
# 1. Delete plugin and helper directories — recreate as modules below.
rm -rf src/plugins src/helpers

# 2. Rename macro files (extension only, content needs manual rewrite).
find src/macros -name "*.orquestra-macro.ts" -exec rename 's/\.orquestra-macro\.ts$/\.macro\.ts/' {} +

# 3. Rename hook calls.
git ls-files '*.ts' | xargs sed -i \
  -e 's/\borquestra\.beforeEach(/orquestra.beforeEachScenario(/g' \
  -e 's/\borquestra\.afterEach(/orquestra.afterEachScenario(/g'

# 4. Update orquestra.config.ts manually:
#    - replace `plugins:`/`helpers:` with `modules:`
#    - move flat fields into `worker:`
#    - drop `OrquestraHtmlReporter` from `reporters:`
```

Each macro and plugin file still requires a manual rewrite — there's no
mechanical translation for class → function or for plugin → module
aggregation. The shapes are small; expect a few hours per medium project.
