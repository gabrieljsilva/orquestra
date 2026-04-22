# @orquestra/core

The engine of the Orquestra platform: BDD primitives, IoC container, lifecycle
management, and reporter API.

If you're looking for the CLI runner and config file, see
[`@orquestra/runner`](https://www.npmjs.com/package/@orquestra/runner).

---

## Install

```bash
npm i -D @orquestra/core @orquestra/runner
```

Pick an HTTP adapter:

```bash
npm i -D @orquestra/adapter-express   # or @orquestra/adapter-fastify
```

---

## Public API

| Export | Purpose |
|---|---|
| `Orquestra` | Library-mode entry point (when not using the CLI) |
| `orquestra`, `initOrquestra`, `getOrquestraInstance` | Global instance used by feature files under the CLI |
| `defineConfig`, `defineSpec` | Identity helpers with type-hinting |
| `OrquestraPlugin`, `OrquestraService`, `OrquestraHelper`, `OrquestraContainer`, `OrquestraMacro` | Injectable base classes |
| `OrquestraHttpServer`, `HttpServerAdapter` | HTTP abstraction consumed by the adapters |
| `OrquestraReporter`, `OrquestraConsoleReporter`, `OrquestraHtmlReporter` | Reporter API and built-ins |
| `EnvHelper`, `Logger` | Utilities |

Types worth knowing:
`OrquestraConfig`, `OrquestraSpec`, `OrquestraArtifact`, `StepEvent`,
`FeatureMeta`, `OrquestraRegistry`.

---

## Core concepts

### Feature, Scenario, Step

```typescript
import { strictEqual } from "node:assert";
import { orquestra } from "@orquestra/core";

const feature = orquestra.feature("create user", {
  context: "Registration is the entry point of the platform.",
  domain: "user management",
  as: "unauthenticated visitor",
  I: "want to register",
  so: "I can use the app",
});

feature
  .scenario("creates with valid data")
  .given("valid credentials", () => ({ user: { email: "a@a.com", password: "123" } }))
  .when("I POST /users", async ({ user }) => {
    const response = await orquestra.http.post("/users").send(user);
    return { response };
  })
  .then("returns 201", ({ response }) => {
    strictEqual(response.statusCode, 201);
  });
```

The context flows through the chain with type inference. `given`/`when`/`then`
each return a new `Scenario<C & T>` where `T` is the return type of the step
function.

### Pending steps

A step without an implementation is marked as `pending`. Useful for
specification-first workflows:

```typescript
feature
  .scenario("it should alert when production drops below threshold")
  .given("the estimate was 2000kg")
  .when("I register a harvest of 1300kg")
  .then("an alert should be emitted");
```

The scenario is registered in the artifact with `status: "pending"`. The PO
writes specs; the dev implements later.

### Injectable base classes

All components (services, plugins, helpers, containers, macros) extend
`Injectable` and receive `ctx` in the constructor. A scoped `this.logger`
(prefixed with the class name, NestJS-style) is available automatically.
In parallel runs, logs emitted from a forked worker are suffixed with
`:W<id>` so main-process and worker output can be told apart (e.g.
`[UserService:W0]`).

```typescript
import { OrquestraService } from "@orquestra/core";

export class UserService extends OrquestraService {
  async onStart() {
    this.logger.info("starting");
  }

  async createUser(email: string) {
    // ...
  }
}
```

### Macros

Macros are reusable steps referenced by title. Declare the context type on the
generic for downstream type inference:

```typescript
import { OrquestraMacro } from "@orquestra/core";

export interface CreateUserMacroContext {
  user: { id: number; email: string };
}

export class CreateUserMacro extends OrquestraMacro<CreateUserMacroContext> {
  override title = "there is a user registered in database";

  async execute(): Promise<CreateUserMacroContext> {
    const user = await this.ctx.container.get(UserService).create({ email: "a@a.com" });
    return { user };
  }
}
```

Inside a scenario, just reference the title:

```typescript
feature
  .scenario("list users")
  .given("there is a user registered in database") // uses the macro above
  .then("I see the user", ({ user }) => { /* user is typed as the macro context */ });
```

### Plugins

Plugins add behavior to the test environment: register services, install HTTP
hooks, manage state.

```typescript
import { OnStart, OrquestraHttpServer, OrquestraPlugin } from "@orquestra/core";
import { AuthService } from "./services";

export class AuthPlugin extends OrquestraPlugin implements OnStart {
  private token: string | null = null;

  async onStart() {
    const httpServer = this.ctx.container.get(OrquestraHttpServer);
    this.ctx.registerServices([AuthService]);

    httpServer.addPreRequestHook((agent) => {
      if (this.token) agent.set("Authorization", `Bearer ${this.token}`);
    }, "all");
  }

  setToken(token: string) { this.token = token; }
  clearToken() { this.token = null; }
}
```

Trivial plugins that only register services can be avoided — put the service
directly under `worker.services` in the config.

### Helpers

Helpers run before plugins/services and can depend on envs written by
containers. They're the right place for per-worker setup:

```typescript
import { EnvHelper, OnStart, OrquestraHelper } from "@orquestra/core";

export class WorkerIsolationHelper extends OrquestraHelper implements OnStart {
  async onStart() {
    const env = this.ctx.container.get(EnvHelper);
    const workerId = process.env.ORQUESTRA_WORKER_ID ?? "0";

    const base = env.get("DATABASE_BASE_URL");
    if (base) {
      const schema = `test_worker_${workerId}`;
      // ... create schema + override DATABASE_URL with search_path
    }
  }
}
```

### Containers

Wrappers around `testcontainers`. Subclass `OrquestraContainer` and expose the
connection details through `EnvHelper.override(...)`:

```typescript
import { EnvHelper, OrquestraContainer } from "@orquestra/core";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Wait } from "testcontainers";

export class PostgresContainer extends OrquestraContainer<StartedPostgreSqlContainer> {
  containerName = "postgres";

  async up() {
    const container = await new PostgreSqlContainer("postgres:16-alpine")
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
    const env = this.ctx.container.get(EnvHelper);
    env.override("DATABASE_BASE_URL", container.getConnectionUri());
    return container;
  }
}
```

### IoC container (`ctx.container`)

Type inference works automatically when you pass a class:

```typescript
const auth = orquestra.get(AuthService);          // AuthService
const env = this.ctx.container.get(EnvHelper);    // EnvHelper
```

For string/Symbol tokens, pass a generic explicitly:

```typescript
const secret = orquestra.get<string>("JWT_SECRET");
```

---

## Lifecycle

```
start()
  1. resolveEnvHelper()        — loads .env, values from config
  2. startContainers()         — topological order based on dependsOn
  3. startHelpers()            — after containers (so they can read envs)
  4. startHttpServer()         — adapter.createClient() available
  5. startPlugins()
  6. startServices()
  7. startMacros()

teardown()
  1. teardownMacros()
  2. teardownServices()
  3. teardownPlugins()
  4. teardownHttpServer()
  5. teardownContainers()      — reverse dependency order
  6. teardownHelpers()
```

Under the CLI runner, the lifecycle is split:
- `provision()` on the main process: containers only
- `start({ skipContainers: true })` on each worker: everything else

See [`@orquestra/runner`](https://www.npmjs.com/package/@orquestra/runner) for details.

---

## Reporters

A reporter receives the fully-rendered `OrquestraArtifact`:

```typescript
import type { OrquestraArtifact, ReporterContext } from "@orquestra/core";
import { OrquestraReporter } from "@orquestra/core";

export class JUnitReporter extends OrquestraReporter {
  run(artifact: OrquestraArtifact, ctx?: ReporterContext) {
    const xml = toJUnitXml(artifact);
    // write to ctx.outputDir if provided, or anywhere you want
  }
}
```

Register reporters in the config:

```typescript
reporters: [
  new OrquestraConsoleReporter(),
  new OrquestraHtmlReporter({ outputDir: "html" }),
  new JUnitReporter(),
]
```

Built-in reporters:

- `OrquestraConsoleReporter` — Gherkin-colored tree with durations, errors
- `OrquestraHtmlReporter` — standalone HTML (file://-friendly) with tabs for
  Suites, Personas, Glossary; collapsed by default; dark-mode aware

Reporter errors never abort the run — each reporter is isolated.

---

## OrquestraRegistry — typed business vocabulary

Feature files reference personas, domains, and macro titles as **strings**. By
default, these are loose strings. After running `npx orquestra types`, the
generated `.orquestra/orquestra.d.ts` augments the registry and turns them into
typed unions with autocomplete and inference:

```typescript
// Before types are generated: string literal unions fall back to `string`
orquestra.feature("x", { as: "registered user", ... });

// After types are generated: autocomplete + type errors on typos
orquestra.feature("x", {
  as: "registered user" | "unauthenticated visitor" | ..., // from all `as` values
  domain: "user management" | "integrations" | ...,        // from spec + features[].domain
});

// And macro titles infer the resulting context:
.given("there is a user registered in database") // knows this adds { user: UserEntity }
.then("check email", ({ user }) => { /* user is typed */ });
```

The generator is part of `@orquestra/runner`. See
[`@orquestra/runner` docs](https://www.npmjs.com/package/@orquestra/runner) for details.

---

## Library-mode vs CLI-mode

The CLI (`npx orquestra test`) is the recommended entry point: it loads your
config, spawns workers, handles lifecycle, generates artifacts. For that mode,
you import the `orquestra` global from `@orquestra/core`.

If you need to drive Orquestra from your own code (embedding in a custom
runner, for example), you can still use `new Orquestra(options)` directly:

```typescript
import { Orquestra } from "@orquestra/core";

const orquestra = new Orquestra({ /* options */ });
await orquestra.start();
// ... use orquestra.feature() etc
await orquestra.teardown();
```

---

## Requirements

- Node.js >= 22
- TypeScript 5.0+
