# @orquestra/runner

CLI and test runner for the Orquestra platform. Loads your config and spec,
discovers `*.feature.ts` files, coordinates workers in parallel via IPC,
generates `artifact.json` and calls reporters.

---

## Install

```bash
npm i -D @orquestra/runner @orquestra/core
```

`@orquestra/runner` exposes a `bin` called `orquestra`, so `npx orquestra ...`
works out of the box after install.

---

## CLI

```bash
npx orquestra test                         # run features from orquestra.config.ts
npx orquestra test --config ./custom.ts    # custom config path
npx orquestra test --tsconfig ./tsconfig.test.json  # custom tsconfig for transpilation
npx orquestra test --concurrency 4         # N parallel workers
npx orquestra test --stopOnFail            # kill all workers on first crash
npx orquestra test user-registration       # filter features by name substring
npx orquestra types                        # generate .orquestra/orquestra.d.ts
npx orquestra --help
```

Exit codes:

- `0` — all scenarios passed
- `1` — one or more scenarios failed, or a worker crashed

---

## `orquestra.config.ts`

The config is a TypeScript file loaded at runtime. Use `defineConfig` from
`@orquestra/core` for type hints.

### Minimal config (single-process, no containers)

```typescript
import { defineConfig } from "@orquestra/core";
import { createApp } from "./app";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";

export default defineConfig({
  httpServer: async () => {
    const { app, close } = await createApp();
    const adapter = new OrquestraAdapterExpress(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
  testMatch: ["**/*.feature.ts"],
});
```

### Full config (parallel workers with containers)

```typescript
import { resolve } from "node:path";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";
import { OrquestraConsoleReporter, OrquestraHtmlReporter, defineConfig } from "@orquestra/core";
import { createApp } from "./app";
import { PostgresContainer, RabbitmqContainer } from "./containers";
import { WorkerIsolationHelper } from "./helpers/isolation.helper";
import { AuthPlugin, DatabasePlugin, RabbitmqPlugin } from "./plugins";
import { CleanDatabaseMacro, CreateUserMacro } from "./macros";

export default defineConfig({
  // Runs once on the main process, before workers start
  global: {
    containers: [PostgresContainer, RabbitmqContainer],
  },

  // Runs on each worker (httpServer, plugins, services, macros)
  worker: {
    helpers: [WorkerIsolationHelper],
    httpServer: async () => {
      const { app, close } = await createApp();
      const adapter = new OrquestraAdapterExpress(app);
      adapter.setCloseHandler(close);
      return adapter;
    },
    plugins: [RabbitmqPlugin, DatabasePlugin, AuthPlugin],
    macros: [CreateUserMacro, CleanDatabaseMacro],
  },

  env: {
    fromValues: {
      JWT_SECRET: "some secret key",
    },
  },

  testMatch: ["**/*.feature.ts"],
  concurrency: 4,
  outputDir: resolve(import.meta.dirname, ".orquestra"),

  spec: "./orquestra.spec.ts",
  reporters: [new OrquestraConsoleReporter(), new OrquestraHtmlReporter({ outputDir: "html" })],
});
```

### Config options reference

| Option | Description |
|---|---|
| `global.containers` | Classes/providers run once on the main process (provision/deprovision) |
| `worker.httpServer` | Factory returning an HTTP adapter |
| `worker.plugins` / `worker.services` / `worker.helpers` / `worker.macros` | Components that run per-worker |
| `httpServer`, `plugins`, etc. (flat) | Shortcuts when there's no global/worker split needed |
| `env.fromPath` / `env.fromValues` | Load env from file and/or literal values |
| `testMatch` | Globs to discover feature files (default: `["**/*.feature.ts"]`) |
| `concurrency` | Number of parallel workers (default: `1`) |
| `timeout` | Per-scenario timeout in ms |
| `outputDir` | Absolute or relative to config directory; default `.orquestra` |
| `spec` | Path to `orquestra.spec.ts` |
| `reporter` / `reporters` | Single reporter or array |

`outputDir` example behaviors:

| `outputDir` value | Resolves to |
|---|---|
| (not set) | `<configDir>/.orquestra/` |
| `"reports"` | `<configDir>/reports/` |
| `"./build/test-output"` | `<configDir>/build/test-output/` |
| `"/tmp/x"` | `/tmp/x/` |

---

## `orquestra.spec.ts`

Business knowledge, separated from technical config so POs/analysts can edit
without touching infra.

```typescript
import { defineSpec } from "@orquestra/core";

export default defineSpec({
  glossary: {
    user: "A person who interacts with the application. Has email, name, and password.",
    contract: "A legal agreement between a user and the platform.",
    "medical guide": "A document that describes a medical procedure or exam.",
  },
  domains: [
    {
      name: "user management",
      context: "Users need to register and authenticate to access the platform.",
    },
    {
      name: "contracts",
      context: "After registration, users can create contracts that bind them to platform services.",
    },
  ],
});
```

- `glossary` is included in the artifact and surfaced in the HTML report;
  reserved for documentation and LLM consumption — not typed.
- `domains` contribute to the generated types (via `orquestra types`).

---

## Feature files

Features live anywhere matching `testMatch` (default `**/*.feature.ts`). They
import the global `orquestra` instance from `@orquestra/core` — the runner
initializes it before the file is loaded.

```typescript
import { strictEqual } from "node:assert";
import { orquestra } from "@orquestra/core";
import { UserService } from "./services";

const feature = orquestra.feature("user registration", {
  context: "Users must register before accessing the platform.",
  domain: "user management",
  as: "unauthenticated visitor",
  I: "want to create my account",
  so: "I can use the platform",
});

feature
  .scenario("registers via REST")
  .given("there is a clean database")                    // macro
  .given("I have valid user data", () => ({
    user: { email: "a@a.com", password: "123" },
  }))
  .when("I POST /users", async ({ user }) => {
    const response = await orquestra.http.post("/users").send(user);
    return { response };
  })
  .then("returns 200", ({ user, response }) => {
    strictEqual(response.statusCode, 200);
    strictEqual(response.body.email, user.email);
  });
```

---

## Parallelism model

- **Unit of parallelism: the feature file.** Scenarios inside a single file run
  sequentially. Files run across workers in parallel.
- **Distribution: work-stealing queue.** Each worker pulls the next available
  file when it finishes the current one.
- **Process isolation:** each worker is a separate `child_process.fork`. No
  shared memory — events cross via IPC.
- **Events in memory:** the main process aggregates step events from all
  workers into a single artifact. No filesystem per-step writes.
- **Log prefixes:** logs emitted from inside a worker are suffixed with
  `:W<id>` so you can tell them apart. Main-process logs stay as
  `[Orquestra]`, worker 0 becomes `[Orquestra:W0]`, worker 1
  `[Orquestra:W1]`, and the same suffix applies to user-defined helpers
  (e.g. `[TestDatabaseService:W0]`).

```
npx orquestra test --concurrency 4

  provision()                  (main process)
    ├── containers up
    └── envs written

  ┌────────────────────────────────────────┐
  │  Worker 1   Worker 2   Worker 3   …    │
  │  features/a  features/b  features/c    │
  │  (child_process.fork, IPC to main)     │
  └────────────────────────────────────────┘

  aggregate events, generate artifact, run reporters

  deprovision()                (main process)
    └── containers down
```

---

## Worker isolation

When `concurrency > 1`, workers share the same containers but must not step on
each other (e.g. truncating the same DB). The runner injects
`ORQUESTRA_WORKER_ID` in every worker; you're expected to use it from a helper
or plugin to scope resources.

Recommended strategy: an `IsolationHelper` that reads the worker ID and scopes
your DB, broker, cache, etc.

### Postgres — schema per worker

```typescript
import { EnvHelper, OnStart, OrquestraHelper } from "@orquestra/core";
import { Client } from "pg";

export class WorkerIsolationHelper extends OrquestraHelper implements OnStart {
  async onStart() {
    const env = this.ctx.container.get(EnvHelper);
    const workerId = process.env.ORQUESTRA_WORKER_ID ?? "0";

    const base = env.get("DATABASE_BASE_URL");
    if (!base) return;

    const schema = `test_worker_${workerId}`;
    const admin = new Client(base);
    await admin.connect();
    try {
      await admin.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    } finally {
      await admin.end();
    }

    const sep = base.includes("?") ? "&" : "?";
    env.override(
      "DATABASE_URL",
      `${base}${sep}options=${encodeURIComponent(`-c search_path=${schema}`)}`,
    );
    env.override("DATABASE_SCHEMA", schema);
  }
}
```

Your app reads `DATABASE_URL` normally; the schema is applied transparently.

### RabbitMQ — queue/exchange prefix per worker

```typescript
if (env.get("RABBITMQ_URL")) {
  env.override("USERS_EXCHANGE", `users_worker_${workerId}`);
  env.override("USERS_QUEUE", `users_worker_${workerId}.created`);
}
```

Your app reads `USERS_EXCHANGE` / `USERS_QUEUE` from env — same name in prod,
worker-scoped in tests.

### Other brokers — same pattern

| Infrastructure | Strategy |
|---|---|
| Postgres / MySQL | Schema or database per worker |
| RabbitMQ | Queue/exchange prefix, or vhost per worker |
| Kafka | Topic prefix or consumer group per worker |
| Redis (cache/pubsub) | DB number (0-15) or key prefix |
| Redis Streams | Stream key prefix |
| SQS/SNS | Queue/topic prefix |
| NATS | Subject prefix or account per worker |

---

## Artifact

Every run writes `<outputDir>/artifact.json`:

```json
{
  "orquestraVersion": "1.0.0",
  "generatedAt": "2026-04-21T14:30:00Z",
  "status": "success",
  "glossary": { "user": "..." },
  "personas": [
    { "name": "registered user", "features": ["authentication", "authorization"] }
  ],
  "domains": [
    { "name": "user management", "context": "...", "features": [...] }
  ],
  "features": [
    {
      "name": "user registration",
      "domain": "user management",
      "context": "...",
      "as": "unauthenticated visitor",
      "I": "want to create my account",
      "so": "I can use the platform",
      "status": "success",
      "scenarios": [
        {
          "name": "registers via REST",
          "status": "success",
          "steps": [
            { "keyword": "Given", "name": "there is a clean database", "status": "success", "durationMs": 14 },
            { "keyword": "When", "name": "I POST /users", "status": "success", "durationMs": 18 }
          ]
        }
      ]
    }
  ],
  "summary": { "totalFeatures": 3, "totalScenarios": 5, "passed": 5, "failed": 0, "pending": 0 }
}
```

This is **the** output — consumed by reporters, LLMs, dashboards.

---

## Type generation

```bash
npx orquestra types
```

Reads the config, spec, and feature files, then emits
`<outputDir>/orquestra.d.ts` with module augmentation:

```typescript
// .orquestra/orquestra.d.ts (auto-generated)
import type { OrquestraMacro } from "@orquestra/core";
import type { CreateUserMacro } from "../macros/create-user.orquestra-macro";
import type { CleanDatabaseMacro } from "../macros/clean-database.orquestra-macro";

type ExtractMacroContext<M> = M extends OrquestraMacro<infer C> ? C : never;

declare module "@orquestra/core" {
  interface OrquestraRegistry {
    personas: "registered user" | "unauthenticated visitor";
    domains: "user management" | "integrations";
    macros: {
      "there is a user registered in database": ExtractMacroContext<CreateUserMacro>;
      "there is a clean database": ExtractMacroContext<CleanDatabaseMacro>;
    };
  }
}
```

Make sure your `tsconfig.json` includes the generated file:

```json
{
  "include": ["./**/*.ts", "./.orquestra/orquestra.d.ts"]
}
```

### What it gives you

- Autocomplete on `feature({ as, domain })`
- Autocomplete on step titles that match a macro
- **Type inference on macro calls** — `.given("there is a user registered in database")`
  automatically adds the macro's context to the downstream scenario context:

```typescript
feature
  .scenario("list users")
  .given("there is a user registered in database") // ← no generic needed
  .then("show list", ({ user }) => {
    // user is typed as { id: number; email: string; ... }
  });
```

### Convention

To make the context inference work, macros must declare their context on the
generic:

```typescript
export interface CreateUserMacroContext {
  user: UserEntity;
}

export class CreateUserMacro extends OrquestraMacro<CreateUserMacroContext> {
  override title = "there is a user registered in database";
  async execute(): Promise<CreateUserMacroContext> { /* ... */ }
}
```

Macros that produce no context simply omit the generic:

```typescript
export class CleanDatabaseMacro extends OrquestraMacro {
  override title = "there is a clean database";
  async execute() { /* void */ }
}
```

Add a build step to run `orquestra types` before `tsc`/tests so types stay in
sync with the specs.

---

## Error handling and crashes

- **Scenario failure** (assertion): reported, other scenarios continue, exit 1
- **Worker crash** (uncaught, OOM): features assigned to that worker are marked
  failed; other workers continue by default; use `--stopOnFail` to abort
  everything immediately

---

## Decorators & TypeScript config

The runner transpiles your TypeScript files at runtime using **SWC**, which
automatically respects your project's `tsconfig.json`. No extra configuration
needed — the same settings you use for `tsc`/IDE work for tests.

### What's auto-detected

| `tsconfig.json` option | Effect on tests |
|---|---|
| `compilerOptions.experimentalDecorators: true` | Legacy decorators (Nest, TypeORM, class-validator) |
| `compilerOptions.experimentalDecorators: false`/absent | TC39 stage-3 decorators (version `2022-03`) |
| `compilerOptions.emitDecoratorMetadata: true` | Emits `Reflect.metadata(...)` (Nest DI, class-validator requires this) |
| `compilerOptions.target` | Target JS version (default `es2022`) |
| `compilerOptions.baseUrl` + `paths` | Path aliases resolved by SWC (you can drop `tsconfig-paths/register`) |
| `extends` | Resolved recursively via the TypeScript API |

### Discovery

The runner searches upward from the `orquestra.config.ts` directory for a
`tsconfig.json`. Override with `--tsconfig <path>`:

```bash
npx orquestra test --tsconfig ./tsconfig.test.json
```

If no `tsconfig.json` is found, SWC defaults apply (TC39 decorators, `target:
es2022`, no metadata emission).

### Troubleshooting

**"Decorating class property failed. Please ensure that transform-class-properties is enabled and runs after the decorators transform."**

This error comes from older versions of Orquestra or from projects where the
runner could not find a `tsconfig.json`. Ensure:

1. Your `tsconfig.json` is discoverable (same directory as
   `orquestra.config.ts` or any ancestor), OR pass `--tsconfig <path>`.
2. It has `"experimentalDecorators": true` when using Nest/TypeORM/class-validator.
3. It has `"emitDecoratorMetadata": true` if your code relies on runtime
   metadata (Nest DI, `class-transformer`'s `@Type(() => Foo)`, etc.).

**Known limitations**

- Output module format is always CommonJS (required by the underlying module
  loader). Feature files written as pure ESM with top-level `import.meta.url`
  tricks may need adaptation.
- `import.meta.env` / `import.meta.paths` / `import.meta.resolve` that jiti
  used to provide are not available under the SWC transformer.

---

## Requirements

- Node.js >= 22 (uses `node:test`, `node:fs.globSync`, `import.meta.dirname`)
- TypeScript 5.0+ for best DX (used internally to resolve `tsconfig.json`)
