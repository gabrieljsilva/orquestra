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
servers, brokers), produces a **structured artifact** (`artifact.json`) that
LLMs and dashboards can consume, and emits a HTML report for humans.

```typescript
// create-user.feature.ts
import { orquestra } from "@orquestra/core";

const feature = orquestra.feature("create user", {
  context: "Registration is the entry point of the platform. Without it, no other module works.",
  domain: "user management",
  as: "unauthenticated visitor",
  I: "want to register",
  so: "I can use the platform",
});

feature
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

**No other BDD tool in the JS ecosystem does this.**

---

## Packages

| Package | What it does |
|---|---|
| [`@orquestra/core`](./packages/core/README.md) | BDD engine, IoC container, lifecycle, reporters |
| [`@orquestra/runner`](https://www.npmjs.com/package/@orquestra/runner) | CLI, config loader, feature discovery, parallelism via IPC, type generation |
| [`@orquestra/adapter-express`](./packages/adapter-express/README.md) | HTTP adapter for Express |
| [`@orquestra/adapter-fastify`](./packages/adapter-fastify/README.md) | HTTP adapter for Fastify |

---

## Quickstart

Install the packages:

```bash
npm i -D @orquestra/core @orquestra/runner @orquestra/adapter-express
```

Create `orquestra.config.ts`:

```typescript
import { resolve } from "node:path";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";
import { OrquestraConsoleReporter, OrquestraHtmlReporter, defineConfig } from "@orquestra/core";
import { createApp } from "./app";

export default defineConfig({
  httpServer: async () => {
    const { app, close } = await createApp();
    const adapter = new OrquestraAdapterExpress(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
  testMatch: ["**/*.feature.ts"],
  outputDir: resolve(import.meta.dirname, ".orquestra"),
  reporters: [new OrquestraConsoleReporter(), new OrquestraHtmlReporter()],
});
```

Write a feature:

```typescript
// features/health.feature.ts
import { strictEqual } from "node:assert";
import { orquestra } from "@orquestra/core";

const feature = orquestra.feature("health check", {
  as: "any client",
  I: "want to verify the service is up",
  so: "I can trust my monitoring",
});

feature
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

## Key ideas

- **Three files, three responsibilities**
  - `orquestra.config.ts` — technical config (containers, HTTP server, plugins, reporters)
  - `orquestra.spec.ts` — business knowledge (glossary, domains)
  - `*.feature.ts` — behaviors (features, scenarios, steps)

- **Owned runner, not a Vitest/Jest plugin** — Orquestra spawns workers, owns the
  lifecycle, handles provision/teardown, aggregates events via IPC.

- **Parallelism with isolation** — `concurrency: N` spawns N workers with a
  work-stealing queue. Each worker has `ORQUESTRA_WORKER_ID`; your `IsolationHelper`
  uses it to scope DB schemas, RabbitMQ queues, etc.

- **Type generation** — `npx orquestra types` reads your config, spec, and
  feature files, then emits `.orquestra/orquestra.d.ts` that augments the
  `OrquestraRegistry` interface. This enables autocomplete for personas/domains
  and type inference from macros.

- **Artifact-first reporting** — every run produces `artifact.json`. Reporters
  (console, HTML, and any you write) consume it.

---

## Migrating from v0.x

The v1 is a breaking change. Read [`MIGRATION.md`](./MIGRATION.md) for a
side-by-side comparison of the old and new APIs.

---

## Requirements

- Node.js >= 22
- TypeScript (recommended)

---

## License

MIT
