# `@orquestra/adapter-fastify`

Fastify HTTP adapter for Orquestra. Wraps a `FastifyInstance` and exposes a
SuperTest agent through `orquestra.http`.

For the user-facing overview, see the [root README](../../README.md).
For migration from v2, see [`MIGRATION.md`](../../MIGRATION.md).

---

## Install

```bash
npm i -D @orquestra/core @orquestra/runner @orquestra/adapter-fastify supertest fastify
```

---

## Usage with the CLI (recommended)

Wire the adapter under `worker.httpServer` in `orquestra.config.ts`:

```typescript
// orquestra.config.ts
import { OrquestraAdapterFastify } from "@orquestra/adapter-fastify";
import { defineConfig } from "@orquestra/core";
import Fastify from "fastify";

async function createApp() {
  const app = Fastify();
  app.get("/", async () => ({ ok: true }));

  // IMPORTANT: Fastify must be fully ready before the adapter wraps it
  await app.ready();

  return { app, close: async () => app.close() };
}

export default defineConfig({
  worker: {
    httpServer: async () => {
      const { app, close } = await createApp();
      const adapter = new OrquestraAdapterFastify(app);
      adapter.setCloseHandler(close);
      return adapter;
    },
  },
  testMatch: ["**/*.feature.ts"],
});
```

Then in a feature file:

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
  .then("returns 200 and ok payload", ({ response }) => {
    strictEqual(response.status, 200);
    strictEqual(response.body.ok, true);
  });
```

Run:

```bash
npx orquestra test
```

---

## Library mode (embedded)

```typescript
import { WorkerOrquestra } from "@orquestra/core";
import { OrquestraAdapterFastify } from "@orquestra/adapter-fastify";

const worker = new WorkerOrquestra({
  httpServer: async () => {
    const { app, close } = await createApp();
    const adapter = new OrquestraAdapterFastify(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
});

await worker.boot();
const res = await worker.http.get("/");
await worker.shutdown();
```

---

## Notes

- The Fastify server must be fully initialized (`await app.ready()`) **before**
  creating the adapter — the adapter reads `app.server` immediately.
- Use `adapter.setCloseHandler(async () => app.close())` for graceful teardown.
- Pre-request hooks can be added via the `OrquestraHttpServer` instance,
  typically inside an `afterStartServer` hook.
