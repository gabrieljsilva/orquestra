# @orquestra/adapter-express

Express HTTP adapter for Orquestra. Wraps an `Express` app and exposes a Supertest agent through `orquestra.http`.

---

## Install
```bash
npm i -D @orquestra/core @orquestra/adapter-express supertest
```

---

## Usage
```ts
import express from 'express';
import { Orquestra } from '@orquestra/core';
import { OrquestraAdapterExpress } from '@orquestra/adapter-express';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/', (_req, res) => res.json({ ok: true }));
  return { app, close: async () => {/* close resources if any */} };
}

const orquestra = new Orquestra({
  httpServer: async () => {
    const { app, close } = createApp();
    const adapter = new OrquestraAdapterExpress(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
});

beforeAll(() => orquestra.start());
afterAll(() => orquestra.teardown());

test('GET /', async () => {
  const res = await orquestra.http.get('/');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});
```

---

## Tips
- Use `adapter.setCloseHandler(async () => app.close?.())` to release server resources on teardown.
- Add pre-request hooks via `orquestra.get(OrquestraHttpServer).addPreRequestHook(...)` to inject headers or auth tokens.
