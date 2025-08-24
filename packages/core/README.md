# @orquestra/core

Integration test orchestration engine for Node.js/TypeScript. It manages your test stack end-to-end: containers, HTTP server, DI/Context, helpers, plugins, macros, and BDD with reporting.

---

## Install
```bash
npm i -D @orquestra/core testcontainers supertest
```
Add an HTTP adapter based on your framework:
```bash
npm i -D @orquestra/adapter-express   # or @orquestra/adapter-fastify
```

---

## Quickstart
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

## Core Concepts
- **Single instance**: one `Orquestra` per test run; reuse across suites for speed.
- **DI/Context**: register containers, helpers, services, plugins, macros. Resolve with `orquestra.get(Token)`.
- **HTTP adapter**: wraps your app and exposes a Supertest client via `orquestra.http`.
- **BDD**: define features and scenarios with `given/when/then`, get typed context and reporting.
- **Env helper**: capture/override/restore environment variables safely during tests.

---

## Lifecycle
Order of operations and where your code runs:
1) Helpers onStart
2) Containers start (with dependency ordering)
3) HTTP server start
4) Plugins onStart
5) Services onStart
6) Macros onStart

Teardown runs in the safe reverse order and prints a console report at the end.

Methods:
- `await orquestra.start(options?)` – boot all components (skip containers with `{ skipContainers: true }`).
- `await orquestra.teardown()` – gracefully stop everything and print the BDD report.
- `await orquestra.provision()` / `await orquestra.deprovision()` – start/stop infra only (helpers, containers, plugins, services, macros).

---

## API Overview
```ts
new Orquestra({
  httpServer?: IHttpServerAdapter | () => IHttpServerAdapter | Promise<IHttpServerAdapter>;
  plugins?: Array<PluginProvider>;
  helpers?: Array<HelperProvider>;
  containers?: Array<ContainerProvider>;
  services?: Array<ServiceProvider>;
  macros?: Array<MacroProvider>;
  env?: LoadEnvOptions;
  logger?: Logger;
});

// Runtime
await orquestra.start();
await orquestra.teardown();
await orquestra.provision();
await orquestra.deprovision();

// DI
const service = orquestra.get<MyService>(MyService);

// HTTP
const res = await orquestra.http.get('/path');
```

Provider forms:
- Class: `MyService`
- Value: `{ provide: Token, useValue: instance }`
- Factory: `{ provide: Token, useFactory: (ctx) => new Impl(ctx) }`

---

## HTTP Client, Hooks and Closing
`orquestra.http` is a Supertest agent with all HTTP verbs.

- Pre-request hooks (add headers, auth, etc.):
```ts
import { HttpMethod } from '@orquestra/core';

// via adapter instance (e.g., inside a plugin or setup)
const http = orquestra.get(OrquestraHttpServer);
http.addPreRequestHook(agent => agent.set('X-Test', '1'), 'all' satisfies HttpMethod | 'all');
```

- Graceful close:
```ts
const adapter = new OrquestraAdapterExpress(app);
adapter.setCloseHandler(async () => app.close?.());
```

- Unwrap the underlying app if needed:
```ts
const httpSrv = orquestra.get(OrquestraHttpServer);
const express = httpSrv.unwrap();
```

---

## Containers with Dependencies
Containers are DI components that manage external infra (e.g., Postgres, RabbitMQ). They start with dependency ordering and stop respecting reverse dependencies.

Important: you only need to implement `up()` and return a `StartedTestContainer`. When `up()` returns the started container, Orquestra will automatically stop it during teardown; you do not need to implement `stop()` yourself.

```ts
import { OrquestraContainer } from '@orquestra/core';
import { StartedTestContainer } from 'testcontainers';

class PostgresContainer extends OrquestraContainer<StartedTestContainer> {
  containerName = 'postgres';
  async up() {
    // start and return StartedTestContainer
    // e.g. return await new PostgreSqlContainer('postgres:16').start();
  }
}

new Orquestra({
  containers: [
    { container: PostgresContainer },
    // or with dependencies
    { container: AppDepsContainer, dependsOn: [PostgresContainer] },
  ],
});
```

---

## Jest/Vitest workers and sharing infrastructure
Most runners (Jest/Vitest) execute tests in multiple workers. Importing `Orquestra` inside each test file creates a new instance per worker, so you typically start/teardown per file.

If you want to provision the infrastructure once and reuse it, export a single instance and call `provision`/`deprovision` in the global setup/teardown. Then, in setup files (or per suite), use `start({ skipContainers: true })` and `teardown()`.

### Shared single instance
```ts
// test/orquestra.instance.ts
import { Orquestra } from '@orquestra/core';
import { OrquestraAdapterExpress } from '@orquestra/adapter-express';
import { createApp } from '../src/app';

export const orquestra = new Orquestra({
  httpServer: async () => {
    const { app, close } = await createApp();
    const adapter = new OrquestraAdapterExpress(app);
    adapter.setCloseHandler(close);
    return adapter;
  },
  // containers, plugins, services, macros ...
});
```

### Jest (global setup/teardown + setup files)
```ts
// test/global-setup.ts
import { orquestra } from './orquestra.instance';
export default async function () {
  await orquestra.provision();
}
```
```ts
// test/global-teardown.ts
import { orquestra } from './orquestra.instance';
export default async function () {
  await orquestra.deprovision();
}
```
```ts
// test/setup-tests.ts (runs in each worker)
import { orquestra } from './orquestra.instance';

beforeAll(async () => {
  await orquestra.start({ skipContainers: true });
});

afterAll(async () => {
  await orquestra.teardown();
});
```
Notes:
- Global setup and teardown import the same module, thus share the same `orquestra` instance.
- Test files should import utilities/services from `orquestra` as needed.

### Vitest (return a teardown function from globalSetup)
```ts
// test/global-setup.ts
import { orquestra } from './orquestra.instance';

export default async function () {
  await orquestra.provision();
  return async () => {
    await orquestra.deprovision();
  };
}
```
```ts
// test/setup-tests.ts (executed in each worker)
import { orquestra } from './orquestra.instance';
import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
  await orquestra.start({ skipContainers: true });
});

afterAll(async () => {
  await orquestra.teardown();
});
```

---

## Env Helper
```ts
import { EnvHelper } from '@orquestra/core';

const env = orquestra.get<EnvHelper>(EnvHelper);
env.override('FOO', 'bar');
// ...
env.restore('FOO');
```

You can also inject static values at boot:
```ts
new Orquestra({
  env: { fromValues: { JWT_SECRET: 'test-secret' } },
});
```

---

## BDD: Features, Scenarios, Steps
Define high-level behavior with a typed, minimal API and get automatic reporting.

```ts
const feature = orquestra.feature('create user', {
  as: 'unauthenticated visitor',
  I: 'want to register',
  so: 'I can use the app',
});

feature
  .scenario('success path')
  .given('I have a valid email and password', () => {
    return { user: { email: 'a@b.com', password: 's3cret' } };
  })
  .when('I send a POST request to "/users"', async ({ user }) => {
    const res = await orquestra.http.post('/users').send(user);
    return { res };
  })
  .then('should return 200', ({ res }) => {
    expect(res.status).toBe(200);
  });

await feature.test();
```

- Reuse steps via Macros:
```ts
import { OrquestraMacro } from '@orquestra/core';

class CreateUserMacro extends OrquestraMacro {
  title = 'there is a user registered in database';
  async execute() {
    // create user via service/helper and return context
    return { userId: 1 };
  }
}

new Orquestra({ macros: [CreateUserMacro] });

feature
  .scenario('contract creation')
  .given('there is a user registered in database') // uses macro by title
  .when('I send a POST to "/contracts"', async ({ userId }) => { /* ... */ });
```

Reporting: on `teardown()`, a console reporter summarizes each BDD step with timing and status.

---

## Plugins & Services
Plugins and Services are DI components with optional lifecycle hooks:
- `onStart()` – called after HTTP server is ready
- `onTeardown()` – called during teardown

Example factory provider receiving the Context:
```ts
new Orquestra({
  plugins: [
    {
      provide: AuthPlugin,
      useFactory: (ctx) => new AuthPlugin(ctx),
    },
  ],
});
```

---

## Logging
Provide a custom `logger` implementing the `Logger` interface to integrate with your logging stack. If omitted, a sensible default logger is used. Lifecycle actions (start/stop per component) are logged with durations.

---

## Best Practices
- Share one `Orquestra` instance across suites to minimize boot time.
- Use container dependency ordering for reliable startup/shutdown.
- Add pre-request hooks for auth headers.
- Truncate or reset DB state in `beforeEach`.
- In CI, consider increasing timeouts for slower environments.
