# `@orquestra/runner`

CLI and test runner for the Orquestra platform.

For the user-facing overview, see the [root README](../../README.md).

---

## CLI

```bash
npx orquestra test     [--config <path>] [--concurrency <n>] [--stopOnFail] [--debug] [<filter>]
npx orquestra types    [--config <path>]
npx orquestra generate debug [--ide=vscode|webstorm|all] [--force] [--print]
npx orquestra cache    clear [--dry-run]
```

- `test` — discovers feature files via `testMatch`, runs them in parallel
  (one worker per concurrency slot), aggregates events, writes
  `artifact.json` and invokes configured reporters.
- `types` — generates `.orquestra/orquestra.d.ts` augmenting
  `OrquestraRegistry` with personas, domains and macro titles. Run after
  changing macros to keep `.given("title")` autocomplete in sync.
- `generate debug` — writes IDE launch configurations that invoke
  `orquestra test --debug` for you. See [Debugging](#debugging) below.
- `cache clear` — wipes the SWC transpile cache (`node_modules/.cache/jiti`).
  Rarely needed since the cache key already factors in the relevant
  `tsconfig.json` fields, but useful when forcing a fresh build for
  diagnostics. `--dry-run` prints what would be removed.

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

---

## Debugging

Setting breakpoints in `.feature.ts` works through three layers, ordered
from least to most setup. Pick the first one that fits and stop there.

### Layer 1 — `--debug` flag

```bash
npx orquestra test --debug
```

Effects:

- Forces `concurrency=1`. Debugging parallel forks means picking ports and
  attaching N times — not worth the friction. The flag prints a notice if
  it overrides a higher concurrency from your config.
- Forks the worker with `--inspect-brk=0` (auto port). The worker pauses
  before user code so the inspector can attach in time. Look for
  `Debugger listening on ws://...` in the output.
- Emits inline source maps from the SWC transformer and forwards
  `--enable-source-maps` to the worker. V8 resolves breakpoints from `.ts`
  to the right line.
- Sets `ORQUESTRA_DEBUG=1` inside the worker so the jiti instance opts in
  to source maps automatically.

After the worker prints the inspector URL, attach from any debugger:

- Chrome: `chrome://inspect` auto-discovers the target.
- VS Code: `Run › Attach to Node Process`.
- WebStorm: `Run › Attach to Node.js/Chrome`.

### Layer 2 — `orquestra generate debug`

Generates a launch configuration for your IDE so you press a single button
instead of remembering flags.

```bash
npx orquestra generate debug                # auto-detects (.vscode/ vs .idea/)
npx orquestra generate debug --ide=vscode   # explicit
npx orquestra generate debug --ide=webstorm
npx orquestra generate debug --ide=all      # both
npx orquestra generate debug --print        # stdout, no write
npx orquestra generate debug --force        # overwrite existing files
```

For VS Code (`.vscode/launch.json`), two configurations are added:
- **Orquestra: debug all features** — runs the whole suite under `--debug`.
- **Orquestra: debug current feature** — filters by the basename of the
  open editor file (`${fileBasenameNoExtension}`). Open a `.feature.ts`,
  press F5, breakpoints inside that file's steps fire.

If `.vscode/launch.json` already exists, the merge is by configuration
name: existing configurations are preserved, ours are added or replaced
in place. Comments in the original file are not preserved on merge — use
`--print` and integrate by hand if you need to keep them.

For WebStorm/JetBrains (`.idea/runConfigurations/*.xml`), each
configuration is a separate file (the JetBrains convention). Re-running
the generator overwrites the same files; no merge needed. Pass `--force`
if you've customized one and want it replaced.

### Layer 3 — Manual `node --inspect-brk` invocation

If you want full control or your editor isn't covered by `generate debug`,
invoking node directly works as long as the parent already has `--inspect*`
in its `execArgv`:

```bash
node --inspect-brk node_modules/.bin/orquestra test --concurrency=1
```

The worker manager filters `--inspect*` flags out of the parent's
`execArgv` and forwards them to each fork (with the auto-incremented port
node assigns), so breakpoints work without `--debug`. Source maps are
**not** emitted in this path — flip that on by also passing `--debug`, or
set `ORQUESTRA_DEBUG=1` in the env yourself.
