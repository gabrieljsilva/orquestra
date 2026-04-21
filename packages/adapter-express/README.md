# @orquestra/adapter-express

Express HTTP adapter for Orquestra. Wraps an `Express` app and exposes a
Supertest agent through `orquestra.http`.

---

## Install

```bash
npm i -D @orquestra/core @orquestra/runner @orquestra/adapter-express supertest
```

---

## Usage with the CLI (recommended)

Wire the adapter in `orquestra.config.ts`:

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
  httpServer: async () => {
    const { app, close } = createApp();
    const adapter = new OrquestraAdapterExpress(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
  testMatch: ["**/*.feature.ts"],
});
```

Then in a feature file:

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

If you're using `new Orquestra(...)` directly:

```typescript
import { Orquestra } from "@orquestra/core";
import { OrquestraAdapterExpress } from "@orquestra/adapter-express";

const orquestra = new Orquestra({
  httpServer: async () => {
    const { app, close } = createApp();
    const adapter = new OrquestraAdapterExpress(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
});

await orquestra.start();
const res = await orquestra.http.get("/");
await orquestra.teardown();
```

---

## Tips

- Use `adapter.setCloseHandler(async () => ...)` to release server resources
  on teardown.
- Add pre-request hooks via
  `orquestra.get(OrquestraHttpServer).addPreRequestHook(...)` to inject
  headers or auth tokens. See the `AuthPlugin` example in the playground.
