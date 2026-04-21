# Migration guide: v0.x → v1.0

v1.0 is a **major breaking change**. Orquestra went from a Vitest/Jest-coupled
library to a standalone platform with its own CLI runner, artifact format and
type generation. This guide walks through every breaking change with
before/after snippets.

If you just want the high-level idea, see the root [README](./README.md).

---

## TL;DR

| Concern | v0.x | v1.0 |
|---|---|---|
| Runner | Vitest/Jest | `npx orquestra test` (owned) |
| Entry point | `new Orquestra({...})` per spec file | Global `orquestra` from `@orquestra/core`, populated by the CLI from `orquestra.config.ts` |
| Test files | `*.spec.ts` with `describe/test/feature.test()` | `*.feature.ts` with `orquestra.feature()` + scenarios |
| Config | Scattered across spec files | Single `orquestra.config.ts` |
| Business knowledge | Not modeled | `orquestra.spec.ts` (glossary, domains) |
| Parallelism | Up to the test runner | Work-stealing across `child_process.fork` workers |
| Persistence | `.orquestra/<runId>/` shards | Single `artifact.json` |
| Reporters | `orquestra.report(new Reporter())` manual | `reporters: [...]` in config, invoked automatically |
| Types | Generics on every step | `npx orquestra types` generates a `.d.ts` with inference |

---

## 1. No more `new Orquestra(...)` in test files

**Before:**

```typescript
// create-user.spec.ts
import { Orquestra, OrquestraConsoleReporter } from "@orquestra/core";
import { CreateUserOrquestraMacro } from "./macros/create-user.orquestra-macro";

describe("user", () => {
  const orquestra = new Orquestra({
    env: { fromValues: { JWT_SECRET: "secret" } },
    macros: [CreateUserOrquestraMacro],
  });

  beforeAll(() => orquestra.start());
  afterAll(async () => {
    await orquestra.report(new OrquestraConsoleReporter());
    await orquestra.teardown();
  });

  test("create a user", async () => {
    const feature = orquestra.feature("create user", {
      as: "visitor",
      I: "want to register",
      so: "I can use the app",
    });

    feature.scenario("ok")
      .given(...).when(...).then(...);

    await feature.test();
  });
});
```

**After** — config once, features anywhere:

```typescript
// orquestra.config.ts
import { defineConfig, OrquestraConsoleReporter } from "@orquestra/core";
import { CreateUserOrquestraMacro } from "./macros/create-user.orquestra-macro";

export default defineConfig({
  env: { fromValues: { JWT_SECRET: "secret" } },
  macros: [CreateUserOrquestraMacro],
  testMatch: ["**/*.feature.ts"],
  reporters: [new OrquestraConsoleReporter()],
});
```

```typescript
// features/create-user.feature.ts
import { orquestra } from "@orquestra/core";

const feature = orquestra.feature("create user", {
  as: "visitor",
  I: "want to register",
  so: "I can use the app",
});

feature.scenario("ok").given(...).when(...).then(...);
// no `feature.test()` — the runner executes scenarios automatically
```

```bash
npx orquestra test
```

- `describe`, `test`, `it` are gone
- No more `beforeAll/afterAll` to start/teardown — runner owns the lifecycle
- `feature.test()` is no longer called by you
- `orquestra.report(...)` is gone — reporters live in the config

Library mode (`new Orquestra(...)`) still works for advanced embedding; see
[`packages/core/README.md`](./packages/core/README.md#library-mode-vs-cli-mode).

---

## 2. `FeatureDefinition` gained `context` and `domain`

```typescript
// Before
orquestra.feature("create user", {
  as: "visitor",
  I: "want to register",
  so: "I can use the app",
});

// After (both fields optional)
orquestra.feature("create user", {
  context: "Registration is the entry point of the platform.",
  domain: "user management",
  as: "visitor",
  I: "want to register",
  so: "I can use the app",
});
```

The `context` is the *why* behind the feature. The `domain` groups features by
bounded context. Both flow into the artifact and into the generated types.

---

## 3. New business-spec file

**New file, optional:** `orquestra.spec.ts`.

```typescript
import { defineSpec } from "@orquestra/core";

export default defineSpec({
  glossary: {
    user: "A person who interacts with the application.",
    contract: "A legal agreement between a user and the platform.",
  },
  domains: [
    { name: "user management", context: "Registration, auth and profile." },
  ],
});
```

Reference it from `orquestra.config.ts`:

```typescript
export default defineConfig({
  spec: "./orquestra.spec.ts",
  // ...
});
```

---

## 4. Macro API now has a generic

**Before** (context type was implicit via `ReturnType`):

```typescript
export class CreateUserOrquestraMacro extends OrquestraMacro {
  title = "there is a user registered in database";
  async execute() {
    return { user: { id: 1, email: "a@a.com" } };
  }
}
```

**After** (context type is an explicit generic, enabling `orquestra types`):

```typescript
export interface CreateUserMacroContext {
  user: { id: number; email: string };
}

export class CreateUserOrquestraMacro extends OrquestraMacro<CreateUserMacroContext> {
  override title = "there is a user registered in database";

  async execute(): Promise<CreateUserMacroContext> {
    return { user: { id: 1, email: "a@a.com" } };
  }
}
```

Void macros omit the generic:

```typescript
export class CleanDatabaseMacro extends OrquestraMacro {
  override title = "there is a clean database";
  async execute() { /* side-effect only */ }
}
```

---

## 5. Global/worker split in the config (for parallelism)

Skippable if you don't use containers or don't want parallelism.

```typescript
export default defineConfig({
  global: {
    containers: [PostgresContainer, RabbitmqContainer], // started once on main
  },
  worker: {
    httpServer: () => createApp(),
    plugins: [AuthPlugin, DatabasePlugin],
    services: [UserService],
    macros: [CreateUserMacro],
    helpers: [WorkerIsolationHelper], // recommended for parallelism
  },
  concurrency: 4,
});
```

Flat shape is still supported for simple projects:

```typescript
export default defineConfig({
  httpServer: () => createApp(),
  plugins: [AuthPlugin],
  testMatch: ["**/*.feature.ts"],
});
```

---

## 6. Worker isolation

When `concurrency > 1`, workers share containers. Without scoping, they'll
step on each other (e.g. truncating the same DB).

Create a `WorkerIsolationHelper` and register it under `worker.helpers`:

```typescript
import { EnvHelper, OnStart, OrquestraHelper } from "@orquestra/core";
import { Client } from "pg";

export class WorkerIsolationHelper extends OrquestraHelper implements OnStart {
  async onStart() {
    const env = this.ctx.container.get(EnvHelper);
    const workerId = process.env.ORQUESTRA_WORKER_ID ?? "0";

    const base = env.get("DATABASE_BASE_URL");
    if (base) {
      const schema = `test_worker_${workerId}`;
      const admin = new Client(base);
      await admin.connect();
      await admin.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await admin.end();

      const sep = base.includes("?") ? "&" : "?";
      env.override("DATABASE_URL", `${base}${sep}options=${encodeURIComponent(`-c search_path=${schema}`)}`);
    }

    if (env.get("RABBITMQ_URL")) {
      env.override("USERS_EXCHANGE", `users_worker_${workerId}`);
      env.override("USERS_QUEUE", `users_worker_${workerId}.created`);
    }
  }
}
```

Your app reads these envs normally — prod names in prod, worker-scoped in tests.

In v0.x there was no parallelism story at the Orquestra level, so no migration
counterpart — this is a new concept.

---

## 7. `ORQUESTRA_RUN_ID` and `.orquestra/<runId>/` are gone

v0.x wrote one JSON file per step under `.orquestra/<runId>/` and tracked runs
by ID. v1.0 keeps everything in memory during the run and writes a single
`artifact.json` at the end.

**Before:**
```
.orquestra/
├── 4a6f-...-b91d/
│   ├── manifest.json
│   ├── meta.json
│   ├── 1739-12345-abc.json   (one file per step event)
│   └── ...
```

**After:**
```
.orquestra/
├── artifact.json   (single consolidated output)
└── html/           (if OrquestraHtmlReporter is configured)
    ├── index.html
    └── assets/
```

If you had tooling reading those per-step files, migrate to reading
`artifact.json`. The consolidated schema is documented in
[`packages/runner/README.md`](./packages/runner/README.md#artifact).

---

## 8. Reporter API: artifact instead of events + meta

**Before:**

```typescript
import type { FeatureMeta, StepEvent } from "@orquestra/core";

class MyReporter extends OrquestraReporter {
  run(events: StepEvent[], meta: FeatureMeta[]) {
    // derive the result yourself
  }
}

afterAll(async () => {
  await orquestra.report(new MyReporter());
});
```

**After:**

```typescript
import type { OrquestraArtifact, ReporterContext } from "@orquestra/core";

class MyReporter extends OrquestraReporter {
  run(artifact: OrquestraArtifact, ctx?: ReporterContext) {
    // artifact.features[], artifact.personas, artifact.summary, ...
    // ctx.outputDir / ctx.artifactPath are provided when called by the runner
  }
}
```

Register in the config:

```typescript
reporters: [new MyReporter()]
```

Old `StepEvent` fields removed: `runId`, `workerPid`, `testFile`, `ts`,
`tCollect`, `tStart`, `tEnd`. New fields: `durationMs`, optional `error`.

`OrquestraReporter` still exposes the old shape internally but the public
method is `run(artifact, ctx?)`. Update any custom reporters.

---

## 9. `OrquestraOptions.historyLimit` removed

Used to control `.orquestra/<runId>/` cleanup. No longer applicable — each
run overwrites `artifact.json`.

---

## 10. `RunManifest` type removed

Manifest checking is gone. If you referenced `RunManifest` anywhere, delete
it.

---

## 11. Bootstrap order changed

v0.x ran helpers **before** containers. v1.0 runs containers first so helpers
can depend on envs set by containers (e.g. `DATABASE_URL`):

```
v0.x:  helpers → containers → httpServer → plugins → services → macros
v1.0:  EnvHelper → containers → helpers → httpServer → plugins → services → macros
```

If your custom helper doesn't touch container envs, nothing changes for you.

---

## 12. Services `onStart`/`onTeardown` now awaited

Bug fix that may change timing. In v0.x, `onStart` and `onTeardown` of services
were called without `await`. A service that ran migrations in `onStart`,
for example, didn't actually finish before the first test ran.

If you were working around this with `await` inside the first scenario or a
custom wait, you can remove it.

---

## 13. `<T>` generic no longer required in `orquestra.get(...)`

**Before:**

```typescript
const auth = orquestra.get<AuthService>(AuthService);
const env = this.ctx.container.get<EnvHelper>(EnvHelper);
```

**After** (class tokens infer automatically):

```typescript
const auth = orquestra.get(AuthService);       // AuthService
const env = this.ctx.container.get(EnvHelper); // EnvHelper
```

String/Symbol tokens still need the generic:

```typescript
const secret = orquestra.get<string>("JWT_SECRET");
```

---

## 14. `feature.scenario().given/when/then` overloads

- Step functions can now return `void` (or `Promise<void>`), removing the need
  to `return {}` from assertion-only steps.
- Step titles are typed against `OrquestraRegistry["macros"]` when types are
  generated — autocomplete for known macro titles, string for anything else.
- Explicit generics like `.given<{ user: UserEntity }>(...)` are no longer
  needed when the step references a known macro; the context is inferred.

---

## 15. New CLI commands

- `npx orquestra test` — replaces the Vitest/Jest command
- `npx orquestra types` — generates `.orquestra/orquestra.d.ts` with
  augmentation for personas, domains and macro titles

Add `orquestra types` as a pre-step in your `build`/`dev`/`test` scripts to
keep types in sync.

---

## 16. Node engine

v1.0 requires **Node.js >= 22** (uses `node:test`, `node:fs.globSync`,
`import.meta.dirname` and related modern APIs).
