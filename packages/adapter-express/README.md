# `@orquestra/adapter-express`

Express HTTP adapter for Orquestra. Wraps an `Express` app and exposes a
SuperTest agent through `orquestra.http`.

For the user-facing overview, see the [root README](../../README.md).

---

## Install

```bash
npm i -D @orquestra/core @orquestra/runner @orquestra/adapter-express supertest
```

---

## Usage with the CLI (recommended)

Wire the adapter under `worker.httpServer` in `orquestra.config.ts`:

```typescript
// orquestra.config.ts
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";
import { defineConfig } from "@orquestra/core";
import express from "express";

function createApp() {
  const app = express();
  app.use(express.json());
  app.get("/", (_req, res) => res.json({ ok: true }));
  return { app, close: async () => { /* release resources */ } };
}

export default defineConfig({
  worker: {
    httpServer: async () => {
      const { app, close } = createApp();
      const adapter = new OrquestraAdapterExpress(app);
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

If you're using `WorkerOrquestra` directly:

```typescript
import { WorkerOrquestra } from "@orquestra/core";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";

const worker = new WorkerOrquestra({
  httpServer: async () => {
    const { app, close } = createApp();
    const adapter = new OrquestraAdapterExpress(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
});

await worker.boot();
const res = await worker.http.get("/");
await worker.shutdown();
```

---

## Tips

- Use `adapter.setCloseHandler(async () => ...)` to release server resources
  on teardown.
- Add pre-request hooks via the `OrquestraHttpServer` instance (e.g. inside
  an `afterStartServer` hook) to inject headers or auth tokens. See the
  `auth` module in the playground for a working example.
