# Orquestra

> **Business-Oriented Software Specification for Node.js/TypeScript.**
> Specs that test. Tests that document. Documentation that LLMs understand.

---

## What is Orquestra?

Orquestra is a code-first BDD platform with its own test runner. Instead of
writing generic test functions, you describe your software in terms of
**personas**, **domains**, **features**, and **scenarios** — all in TypeScript,
with type inference.

The runner executes those specs against real infrastructure (containers, HTTP
servers, brokers) and produces a **structured artifact** (`artifact.json`)
that LLMs and dashboards can consume.

```typescript
// create-user.feature.ts
import { defineFeature } from "@orquestra/core";

const createUser = defineFeature("create user", {
  context: "Registration is the entry point of the platform. Without it, no other module works.",
  domain: "user management",
  as: "unauthenticated visitor",
  I: "want to register",
  so: "I can use the platform",
});

createUser
  .scenario("should create a user with valid data")
  .given("I have valid email and password", () => ({ user: { email: "a@a.com", password: "123" } }))
  .when('I send POST to "/users"', async ({ user }) => {
    const response = await orquestra.http.post("/users").send(user);
    return { response };
  })
  .then("should return 201", ({ response }) => {
    strictEqual(response.statusCode, 201);
  });
```

```bash
npx orquestra test
```

---

## Why?

Most BDD tools sit on top of Jest/Vitest and produce pass/fail. Orquestra is
designed to let the *business layer* live in code:

- **Personas** (the `as` in each feature) are extracted automatically
- **Domains** group features by bounded context
- **Context** captures *why* a feature exists — the business driver
- **Glossary** encodes the ubiquitous language of the project

All of this ends up in a structured `artifact.json` — the single source of
truth for tests, docs, and AI tooling.

---

## Packages

| Package | What it does |
|---|---|
| [`@orquestra/core`](./packages/core/README.md) | BDD engine, IoC container, lifecycle, console reporter |
| [`@orquestra/runner`](https://www.npmjs.com/package/@orquestra/runner) | CLI, config loader, feature discovery, parallelism via IPC, type generation |
| [`@orquestra/adapter-express`](./packages/adapter-express/README.md) | HTTP adapter for Express |
| [`@orquestra/adapter-fastify`](./packages/adapter-fastify/README.md) | HTTP adapter for Fastify |

---

## Quickstart

Install:

```bash
npm i -D @orquestra/core @orquestra/runner @orquestra/adapter-express
```

Create `orquestra.config.ts`:

```typescript
import { resolve } from "node:path";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";
import { OrquestraConsoleReporter, defineConfig } from "@orquestra/core";
import { createApp } from "./app";

export default defineConfig({
  worker: {
    httpServer: async () => {
      const { app, close } = await createApp();
      const adapter = new OrquestraAdapterExpress(app);
      adapter.setCloseHandler(close);
      return adapter;
    },
  },
  testMatch: ["**/*.feature.ts"],
  outputDir: resolve(import.meta.dirname, ".orquestra"),
  reporters: [new OrquestraConsoleReporter()],
});
```

Write a feature:

```typescript
// features/health.feature.ts
import { strictEqual } from "node:assert";
import { defineFeature, orquestra } from "@orquestra/core";

const health = defineFeature("health check", {
  as: "any client",
  I: "want to verify the service is up",
  so: "I can trust my monitoring",
});

health
  .scenario("root endpoint responds")
  .when("I GET /", async () => {
    const response = await orquestra.http.get("/");
    return { response };
  })
  .then("returns 200", ({ response }) => {
    strictEqual(response.statusCode, 200);
  });
```

Run:

```bash
npx orquestra test
```

---

## Components

Orquestra has four kinds of components, each suited to its role:

| Component | Form | Purpose |
|---|---|---|
| **Module** | `defineModule({...})` | Aggregates services, macros, containers and lifecycle hooks. Composable via `modules: [...]`. |
| **Macro** | `defineMacro({ title, execute })` | Reusable BDD step looked up by title. Title becomes part of the `OrquestraRegistry` types. |
| **Service** | `class extends OrquestraService` | Stateful injectable with a public API. Optional `onStart`/`onTeardown` (run after the http server is up). |
| **Container** | `class extends OrquestraContainer<T>` | Wraps a testcontainer. Provisioned once globally, shared across workers via env vars. |

Example module:

```typescript
import { defineModule, defineMacro, OrquestraService } from "@orquestra/core";

export class AuthService extends OrquestraService {
  setToken(t: string) { /* ... */ }
}

export const loginMacro = defineMacro({
  title: "I am signed in as admin",
  execute: async (ctx) => {
    const auth = ctx.get(AuthService);
    auth.setToken("admin-token");
  },
});

export const authModule = defineModule({
  services: [AuthService],
  macros: [loginMacro],
  beforeStartServer: (ctx) => {
    // pre-server hook scoped to this module
  },
});
```

---

## Lifecycle hooks

Hooks operate at three scopes — file, feature and scenario:

```typescript
import {
  beforeStartServer,
  afterStartServer,
  beforeEachFeature,
  afterEachFeature,
  beforeEachScenario,
  afterEachScenario,
  beforeStopServer,
  useEnv,
} from "@orquestra/core";

beforeStartServer((ctx) => {
  ctx.env.override("RATE_LIMIT_PER_SECOND", "3");
});

beforeEachScenario(async (ctx) => {
  await ctx.get(CleanDatabaseMacro).execute();
});

afterEachScenario(() => nock.cleanAll());

useEnv({ JWT_SECRET: "old-secret-being-deprecated" });   // shorthand
```

Setup hooks run **FIFO**, cleanup hooks **LIFO**. `process.env` is
automatically restored between files. See [`lifecycle.md`](./lifecycle.md)
for the full sequence diagram.

Shared hooks fit naturally inside modules — declare them in `defineModule`
and they're activated whenever the module is included:

```typescript
export const isolationModule = defineModule({
  services: [WorkerIsolation],
  beforeStartServer: (ctx) => ctx.get(WorkerIsolation).setup(),
});
```

---

## Key ideas

- **Three files, three responsibilities**
  - `orquestra.config.ts` — technical config (containers, HTTP server, modules, reporters)
  - `orquestra.spec.ts` — business knowledge (glossary, domains)
  - `*.feature.ts` — behaviors (features, scenarios, steps)

- **Owned runner, not a Vitest/Jest plugin** — Orquestra spawns workers, owns the
  lifecycle, handles provision/teardown, aggregates events via IPC.

- **Parallelism with isolation** — `concurrency: N` spawns N workers with a
  work-stealing queue. Each worker has `ORQUESTRA_WORKER_ID`; isolation
  modules use it to scope DB schemas, RabbitMQ queues, etc. `process.env` is
  snapshotted per worker and restored between files.

- **Three-phase deterministic lifecycle** — `resolve` (sync construction) →
  `boot` (async, `onStart`) → `teardown` (async, reverse). No lazy
  resolution; macros are available at file-import time.

- **Type generation** — `npx orquestra types` reads your config, spec, and
  feature files, then emits `.orquestra/orquestra.d.ts` that augments
  `OrquestraRegistry`. Enables autocomplete for personas/domains and type
  inference from macros.

- **Artifact-first reporting** — every run produces `artifact.json`. Build
  custom reporters on top of that schema.

---

## Migrating from v2.x

v3 is a major breaking release. Read [`MIGRATION.md`](./MIGRATION.md).

---

## Requirements

- Node.js >= 22
- TypeScript (recommended)

---

## License

MIT
