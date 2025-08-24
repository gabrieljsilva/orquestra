# @orquestra/adapter-fastify

Fastify HTTP adapter for Orquestra. Wraps a `FastifyInstance` and exposes a Supertest agent through `orquestra.http`.

---

## Install
```bash
npm i -D @orquestra/core @orquestra/adapter-fastify supertest fastify
```

---

## Usage
```ts
import Fastify from 'fastify';
import { Orquestra } from '@orquestra/core';
import { OrquestraAdapterFastify } from '@orquestra/adapter-fastify';

async function createApp() {
  const app = Fastify();
  app.get('/', async () => ({ ok: true }));

  // IMPORTANT: make sure Fastify is ready before using the adapter
  await app.ready();

  return { app, close: async () => app.close() };
}

const orquestra = new Orquestra({
  httpServer: async () => {
    const { app, close } = await createApp();
    const adapter = new OrquestraAdapterFastify(app);
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

## Notes
- The Fastify server must be fully initialized (`await app.ready()`) before creating the adapter.
- Use `adapter.setCloseHandler(async () => app.close())` for graceful teardown.
- Pre-request hooks can be added via `orquestra.get(OrquestraHttpServer).addPreRequestHook(...)`.
