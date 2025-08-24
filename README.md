# Orquestra – Integration Test Orchestration for Node.js/TypeScript

> One‑liner: Spin up Docker containers, start your HTTP server, inject typed helpers, connect plugins (GraphQL, AMQP, etc.) – all from a single, shareable instance across your test suites.

---

## What is Orquestra?
Orquestra is a pragmatic toolkit to orchestrate realistic integration test environments. It manages the full lifecycle of your test stack:
- **Containers**: Start/stop dependent services (e.g., Postgres, RabbitMQ) with dependency ordering.
- **HTTP server**: Wrap your app with an adapter (Express/Fastify) and get a Supertest client.
- **Plugins & Helpers**: Register injectable utilities and clients to keep tests concise and reusable.
- **BDD**: Define features, scenarios, and steps with a minimal, strongly-typed API; collect step events for reporting.

Built for speed, clarity, and reliability on CI.

---

## Packages in this monorepo
- `@orquestra/core`: Main orchestration engine (lifecycle, DI/Context, BDD, HTTP client, env helper).
- `@orquestra/adapter-express`: HTTP adapter for Express apps.
- `@orquestra/adapter-fastify`: HTTP adapter for Fastify apps.

Each package has its own README with focused instructions and examples.

---

## Quickstart
Install the core and at least one HTTP adapter:
```bash
npm i -D @orquestra/core @orquestra/adapter-express testcontainers supertest
```

Basic usage:
```ts
import { Orquestra } from '@orquestra/core';
import { OrquestraAdapterExpress } from '@orquestra/adapter-express';
import { createApp } from './app';

const orquestra = new Orquestra({
  httpServer: async () => {
    const { app, close } = await createApp();
    const adapter = new OrquestraAdapterExpress(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
});

beforeAll(() => orquestra.start());
afterAll(() => orquestra.teardown());

test('health', async () => {
  const res = await orquestra.http.get('/');
  expect(res.statusCode).toBe(200);
});
```

---

## Why Orquestra?
- **Realistic tests**: Exercise your app against real infra, not mocks.
- **Deterministic lifecycle**: Ordered startup/shutdown, dependency graph, and clean teardown.
- **Ergonomics**: One instance, shared across suites; injectable services; pre-request hooks.
- **Extensible**: Plugins, macros, helpers, and adapters.

---

## Learn more
- Core: see `packages/core/README.md` for full guide, lifecycle, BDD, reporters, and logs.
- Express adapter: `packages/adapter-express/README.md`.
- Fastify adapter: `packages/adapter-fastify/README.md` (server must be ready before use).
