# `@orquestra/runner`

CLI and test runner for the Orquestra platform.

For the user-facing overview, see the [root README](../../README.md).
For migration from v2.x, see [`MIGRATION.md`](../../MIGRATION.md).

---

## CLI

```bash
npx orquestra test [--config <path>] [--concurrency <n>] [--stopOnFail] [<filter>]
npx orquestra types [--config <path>]
```

- `test` — discovers feature files via `testMatch`, runs them in parallel
  (one worker per concurrency slot), aggregates events, writes
  `artifact.json` and invokes configured reporters.
- `types` — generates `.orquestra/orquestra.d.ts` augmenting
  `OrquestraRegistry` with personas, domains and macro titles. Run after
  changing macros to keep `.given("title")` autocomplete in sync.

The runner uses `ParallelRunner` regardless of concurrency — `concurrency=1`
just spawns a single worker.

---

## Lifecycle (per worker, per file)

```
worker boot:
  • snapshot process.env

per feature file (work-stealing queue):
  • restore env from snapshot
  • new WorkerOrquestra (Phase 1: resolve)
  • jiti.import(file) — features and hooks register
  • Phase 2: boot — beforeStartServer → http listen → services.onStart → afterStartServer
  • for each feature in file: beforeEachFeature → (per scenario: beforeEachScenario → run → afterEachScenario) → afterEachFeature
  • Phase 3: teardown — beforeStopServer → services.onTeardown → http close

worker shutdown:
  • exit
```

See [`lifecycle.md`](../../lifecycle.md).

---

## Type generation

`extractMacros` walks the project AST and finds calls to `defineMacro({...})`
with a literal-string `title`. Each detected macro becomes an entry in the
generated `.orquestra/orquestra.d.ts`:

```ts
declare module "@orquestra/core" {
  interface OrquestraRegistry {
    personas: "registered user" | "unauthenticated visitor";
    domains: "user management";
    macros: {
      "there is a clean database": ExtractMacroContext<typeof cleanDatabaseMacro>;
      "there is a user registered in database": ExtractMacroContext<typeof createUserMacro>;
    };
  }
}
```

This drives autocomplete and context inference in `.given("...")`,
`.when("...")`, `.then("...")` calls in feature files.

---

## Programmatic embedding

```ts
import { ParallelRunner } from "@orquestra/runner";

const runner = new ParallelRunner({
  config,
  configPath,
  configDir,
  spec,
  featureFiles,
  concurrency: 4,
  stopOnFail: false,
});
const { artifact, artifactPath, crashed } = await runner.run();
```

---

## Configuration shape

`@orquestra/runner` consumes `OrquestraConfig` from `@orquestra/core` (only
the `{ global, worker }` shape — flat shape was removed in v3). See the
[root README](../../README.md) for an end-to-end example.

## Time budgets and memory recycle

| Field                   | Default | What it caps                                                                 |
| ----------------------- | ------- | ---------------------------------------------------------------------------- |
| `scenarioTimeoutMs`     | 5000    | Body of each scenario. Override per-feature via `defineFeature({ timeoutMs })` or per-scenario via `feature.scenario(name, { timeoutMs })`. |
| `eachHookTimeoutMs`     | 10000   | `before/afterEachScenario`, `before/afterEachFeature`.                       |
| `serverHookTimeoutMs`   | 60000   | `beforeStartServer`, `afterStartServer`, `beforeStopServer`, and service `onStart`/`onTeardown`. |
| `workerMemoryLimitMb`   | _off_   | Soft cap (MB) per worker. After a feature finishes, a worker whose `heapUsed` is at/above this is gracefully drained and replaced. Leave undefined to disable recycling — the long-running worker path is the same as before. |

A scenario timeout fails the affected scenario and still runs its
`afterEachScenario` hook; sibling scenarios inside the same feature continue
to run. Hooks honor the same `withTimeout` semantics — exceeding the budget
is reported as a hook failure, not a worker crash.

## Global hooks (config-time, main process)

Global hooks run **once per run, in the main process**, around container
provisioning. They are declared inside the `global` block of
`orquestra.config.ts`:

```ts
import { defineConfig, Postgres } from "@orquestra/core";

export default defineConfig({
  global: {
    containers: [postgres, keycloak, rabbit],

    afterProvision: async (ctx) => {
      // Example: build a "template" Postgres database with migrations + seeds
      // already applied. Each worker can then `CREATE DATABASE x TEMPLATE ...`
      // for ~50ms instead of running the migrations from scratch.
      const pg = ctx.container.get(Postgres);
      await pg.query("CREATE DATABASE test_template");
      await runMigrations(pg, "test_template");
      await runSeeds(pg, "test_template");
    },

    beforeDeprovision: async (ctx) => {
      // Optional: dump state for debugging when the run failed.
    },
  },
});
```

Available hooks: `beforeProvision`, `afterProvision`, `beforeDeprovision`,
`afterDeprovision`. Each accepts a single function or an array of functions.
Setup-side hooks (`before/afterProvision`) abort the run on failure;
cleanup-side hooks (`before/afterDeprovision`) log and continue so containers
still come down.

### Why global hooks have **no** `ctx.http`

The main process never owns an HTTP server — each worker boots its own. The
`GlobalHookContext` is intentionally narrower than the worker `HookContext`:

| Field             | Worker hooks | Global hooks |
| ----------------- | :----------: | :----------: |
| `ctx.env`         |      ✓       |      ✓       |
| `ctx.container`   |      ✓       |  ✓ (global)  |
| `ctx.get(Token)`  |      ✓       |  ✓ (global)  |
| `ctx.http`        |      ✓       |   ✗ (n/a)    |

`ctx.container` in a global hook resolves to the **global IoC** — it sees
testcontainers (`Postgres`, `RabbitMQ`, `Keycloak`, …) declared in
`global.containers`. It does **not** see worker-scoped `services` or
`macros`.

The time budget for each global hook is `serverHookTimeoutMs` (default
60000ms) — same as worker server-lifecycle hooks. Override via that field.
