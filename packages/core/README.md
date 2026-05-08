# `@orquestra/core`

The BDD engine, IoC container and lifecycle primitives that power Orquestra.

For the user-facing overview, see the [root README](../../README.md).

---

## What this package exposes

### Component authoring

| Symbol | Form | Purpose |
|---|---|---|
| `defineModule({ services, macros, containers, modules, ...hooks })` | function | Aggregator with optional shared hooks |
| `defineMacro({ title, execute })` | function | Reusable BDD step looked up by title — see [Macros](#macros--input-and-output) |
| `defineFeature(name, definition)` | function | Top-level feature declaration (Vitest-style import) |
| `defineConfig(...)` | function | Type helper for `orquestra.config.ts` |
| `defineSpec(...)` | function | Type helper for `orquestra.spec.ts` |
| `OrquestraService` | class | Base for injectable services with state and API |
| `OrquestraContainer<T>` | class | Base for testcontainer wrappers |

### Lifecycle hooks (file scope)

```ts
import {
  beforeStartServer,
  afterStartServer,
  beforeStopServer,
  beforeEachFeature,
  afterEachFeature,
  beforeEachScenario,
  afterEachScenario,
  useEnv,
} from "@orquestra/core";
```

The same names are also available on the `orquestra` facade
(`orquestra.beforeStartServer(...)`).

### Step-scoped helpers

```ts
import { attach, log } from "@orquestra/core";
```

| Symbol | Form | Purpose |
|---|---|---|
| `attach({ name, type, data, mimeType? })` | function | Bind rich content (text/markdown/json/image/file) to the running step |
| `log(label, value)` | function | Bind a small key/value pair to the running step |

Both are bound to the **currently-executing step callback** by a process-local
singleton — they throw if called outside a step. See
[Attachments & logs](#attachments--logs--attach--log) below for the full
reference (rules of use, supported types, error messages, output schema).

### Worker / global instances

| Symbol | Use |
|---|---|
| `WorkerOrquestra` | per-file instance inside a worker. Owns http server, services, macros, modules. |
| `GlobalOrquestra` | main process instance. Owns containers (provision/deprovision). |
| `initOrquestra(opts)` | sets the singleton consumed by free-function hooks and `orquestra.feature`. Called by the runner per file. |
| `getOrquestraInstance()` | returns the current singleton. |
| `resetOrquestraInstance()` | clears the singleton — required between files. |
| `orquestra` | facade with `feature`, `http`, `get`, plus all hooks. |

### Three-phase lifecycle

```
new WorkerOrquestra(opts)
   └─ Phase 1 (sync): resolve modules, instantiate services, populate macro registry

await worker.boot()
   └─ Phase 2 (async): beforeStartServer → http listen → services.onStart → macros.onStart → afterStartServer

(per feature, per scenario)

await worker.shutdown()
   └─ Phase 3 (async, reverse): beforeStopServer → macros.onTeardown → services.onTeardown → http close
```

### Reporters

```ts
import { OrquestraReporter, OrquestraConsoleReporter } from "@orquestra/core";
```

The HTML reporter was removed in v3 — build a custom reporter on top of
`artifact.json` if you need a UI.

### Types you'll touch

```ts
export type { HookFn, HookContext, HookKind } from "@orquestra/core";
export type { MacroDefinition, ModuleDefinition } from "@orquestra/core";
export type { OrquestraArtifact, ArtifactFeature, ArtifactScenario } from "@orquestra/core";
export type { ArtifactAttachment, ArtifactLog, AttachmentInput, AttachmentType } from "@orquestra/core";
export type { OrquestraConfig, GlobalOrquestraOptions, WorkerOrquestraOptions } from "@orquestra/core";
```

---

## Macros — input and output

When a macro is invoked from a feature via `.given(title)` / `.when(title)` / `.then(title)`, `execute` runs with two arguments:

- `ctx`: the `HookContext` — IoC container (`get`), `env`, `http`.
- `input`: the **accumulated scenario context** — the same object that inline step callbacks receive.

If `execute` returns an object, that object is merged into the scenario context and is available to the steps that follow. Macros that don't need to read or contribute context can keep ignoring both arguments.

```ts
import { defineMacro } from "@orquestra/core";

const persistUser = defineMacro<{ persistedUser: User }, { user: User }>({
  title: "that user is persisted in the database",
  execute: async (ctx, { user }) => {
    const persistedUser = await ctx.get(UserService).create(user);
    return { persistedUser };
  },
});
```

```ts
feature
  .scenario("...")
  .given("there is a user registered in database")    // → { user }
  .given("that user is persisted in the database")    // reads { user }, adds { persistedUser }
  .given("that user logs in")                          // reads { user }, adds { token }
  .when(...)
  .then(...);
```

Macros compose without depending on each other directly: each declares the minimum it needs (e.g. `{ user: User }`) and the scenario context flows through. If a macro throws, the error message is prefixed with `[macro "<title>"]` so failures are easy to trace.

---

## Asserts: bring your own

Orquestra is **assertion-agnostic** by design. The `BddRunner` wraps each
step in `try { await step.fn(ctx) } catch (err) { ... }` — anything that
throws becomes a failed step, and `error.message` / `error.stack` flow into
`artifact.json`. The framework neither ships nor requires a matcher
library.

Pick what fits your project:

| Library                | Style                      | Notes                                                                                       |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `node:assert/strict`   | `assert.strictEqual(a, b)` | Zero-dep, in the standard library, fine for 90% of E2E checks. Default in the playground.  |
| `@vitest/expect`       | `expect(a).toBe(b)`        | Jest-style, deep diff, `expect.any` / `toMatchObject`. Standalone — does not pull Vitest in. |
| `expect@29`            | `expect(a).toBe(b)`        | Jest's matcher package as a standalone npm dependency.                                      |
| `chai` (+ `chai-as-promised`) | `expect(a).to.equal(b)` | Fluent, mature, async resolvers when paired with the plugin.                          |
| `should.js`, `uvu/assert`, `tape` | various          | Work too — any lib that throws on failure.                                                  |

```ts
// node:assert/strict (zero-dep)
import { strictEqual } from "node:assert";

scenario.then("returns 200", (ctx) => {
  strictEqual(ctx.response.status, 200);
});

// @vitest/expect (jest-style)
import { expect } from "@vitest/expect";

scenario.then("returns the user", (ctx) => {
  expect(ctx.response.status).toBe(200);
  expect(ctx.response.body).toMatchObject({ id: expect.any(String) });
});
```

### Caveats

- **Async resolvers** (`await expect(promise).resolves.toBe(...)`) depend
  on the library — `@vitest/expect` and `chai-as-promised` support it,
  `node:assert` does not. Not an Orquestra concern.
- **Mocks are a separate package.** `vi.fn()` needs `@vitest/spy`,
  `jest.fn()` needs `jest-mock`. For E2E suites that hit real HTTP / DB /
  brokers (the case Orquestra targets), you typically don't need mocks at
  all.
- **`toMatchSnapshot()` is not integrated.** The snapshot store lives in
  Vitest/Jest's runner, not in your matcher lib. Manual string snapshot
  comparison works; rich snapshot testing does not (yet — a future
  artifact-aware version may land).
- **Custom matchers** (`expect.extend({ toBeMyDomainThing })`) work
  normally — they're side effects on the matcher lib, Orquestra has no
  opinion.

The takeaway: pick the matcher style your team likes, keep it consistent,
and don't expect Orquestra to own this part of the stack.

---

## Attachments & logs — `attach` / `log`

Some checks can't be expressed as a strict `assert`: an AI agent's text
reply, a complex JSON response a PM wants to eyeball, a screenshot from a
browser test. For those, Orquestra ships two top-level helpers that bind
arbitrary content to the **currently-running step** and emit it into
`artifact.json` (or, for binaries / oversized payloads, a sibling file
under `outputDir/attachments/`).

```ts
import { attach, log } from "@orquestra/core";

feature.scenario("recommends 3 products based on user history")
  .given("a user with purchase history", async () => {
    const user = await seed.userWithPurchases(["camera", "lens"]);
    return { user };
  })
  .when("user asks for recommendations", async ({ user }) => {
    const response = await ai.chat({ user: user.id, prompt: "What should I buy next?" });

    attach({ name: "Prompt", type: "text", data: "What should I buy next?" });
    attach({ name: "AI response", type: "markdown", data: response.text });
    attach({ name: "Tool calls", type: "json", data: response.toolCalls });
    log("model", response.model);
    log("token_cost", response.usage);

    return { response };
  })
  .then("called the right MCP tool", ({ response }) => {
    strictEqual(response.toolCalls[0].name, "search_products");
  });
```

### When to use which

- **`attach({ name, type, data })`** — content the reader will *open and
  read*: free-form text, markdown, JSON trees, screenshots, file dumps.
- **`log(label, value)`** — small key/value pair the UI can *filter,
  group or chart*: model name, token cost, latency, classification label.

### Supported types

| `type`     | `data` shape                          | Storage                                   |
| ---------- | ------------------------------------- | ----------------------------------------- |
| `text`     | `string`                              | inline if ≤ `inlineThresholdBytes`, else file |
| `markdown` | `string`                              | inline if ≤ `inlineThresholdBytes`, else file |
| `json`     | any JSON-serializable value           | inline if ≤ `inlineThresholdBytes`, else file |
| `image`    | `Buffer` / `Uint8Array` (+ `mimeType`) | always file (`outputDir/attachments/...`) |
| `file`     | `Buffer` / `Uint8Array` (+ `mimeType`) | always file (`outputDir/attachments/...`) |

Spilled attachments are referenced by relative path on the
`ArtifactStep`, e.g. `attachments/<scenarioId>/0-AI_response.md`. Inline
attachments carry the payload directly on `step.attachments[i].inline`.

Configure the threshold in `defineConfig`:

```ts
export default defineConfig({
  inlineThresholdBytes: 100_000, // default: 51_200 (50 KB)
});
```

### Use cases

- **AI / LLM validation** — the canonical case. Free-form text answers
  are rarely 100% assertable; PM reads the markdown, marks
  approved/reproved.
- **HTTP payload inspection** — `attach({ name: "Response body", type:
  "json", data: response.body })` — useful when a strict deep-equal
  against a literal payload is too brittle.
- **Browser tests** — `attach({ name: "Final screenshot", type: "image",
  data: await page.screenshot(), mimeType: "image/png" })`.
- **Diagnostic dumps on failure** — log model versions, token costs and
  latency so failed runs explain themselves without a re-run.

### Rules of use (read this)

`attach` and `log` are bound to the **currently-running step** by a
module-level singleton that the BDD runner sets at the start of each step
and clears in `finally`. This works only because each Orquestra worker
runs **one scenario at a time, sequentially**, in its own isolated
process — there is never more than one active step in the same memory
space. The runner does not use `AsyncLocalStorage` here, so two rules
apply:

1. **Always `await` async work inside the step.** A fire-and-forget
   promise that resolves *after* the step has returned will either:
   - throw `attach() called after step "X" finished — likely a
     fire-and-forget promise.` (when no other step has started yet — the
     collector is frozen), or worse,
   - silently anchor onto a *different* step if a new one has begun.

   The framework cannot distinguish the second case from a legitimate
   call. Discipline yourself: every async branch the step touches must
   be awaited before the callback returns. Pair this with an ESLint rule
   like `@typescript-eslint/no-floating-promises` if you want a static
   guarantee.

2. **`attach` / `log` only work *inside* a step callback.** Calling them
   at module top level, in `beforeAll`, in plugin code that runs outside
   a step, or in any of the lifecycle hooks
   (`beforeStartServer`, `afterStartServer`, `beforeEachScenario`,
   `afterEachScenario`, `beforeEachFeature`, `afterEachFeature`,
   `beforeStopServer`) throws:
   ```
   Error: attach() must be called inside a step or hook callback
   ```

   Hook support is on the roadmap (the typical "DB snapshot on
   `afterEachScenario` failure" use case), but is **not** in v3 — capture
   diagnostics inside a step's callback for now.

### Error messages you might see

| Message                                                                                | Cause                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `attach() must be called inside a step or hook callback`                               | Called from module scope, hook, or after the runner is done                    |
| `attach() called after step "<id>" finished — likely a fire-and-forget promise.`       | An async branch leaked past the step boundary; `await` it inside the callback  |
| `log() ...` (mirror of the above)                                                      | Same root cause as `attach()`                                                  |

### Output shape

`artifact.json` gains two optional fields per step:

```ts
interface ArtifactStep {
  // ...existing keyword/name/status/durationMs/error...
  attachments?: ArtifactAttachment[];
  logs?: ArtifactLog[];
}

interface ArtifactAttachment {
  name: string;
  type: "text" | "markdown" | "json" | "image" | "file";
  mimeType?: string;
  bytes: number;
  timestamp: string;          // ISO 8601 — set when `attach()` is called
  inline?: string | unknown;  // present when small & non-binary
  path?: string;              // present when spilled to disk (relative to outputDir)
}

interface ArtifactLog {
  label: string;
  value: unknown;
  timestamp: string;          // ISO 8601 — set when `log()` is called
}
```

Both `ArtifactAttachment` and `ArtifactLog` carry an ISO timestamp set at
the moment the helper is called, so a viewer can interleave them in
chronological order (useful when a step emits a mix of diagnostics
across an async flow).

The console reporter shows a compact `[N attachments, M logs]` suffix on
each step that emits anything; richer rendering is left to custom
reporters reading `artifact.json`.

---

## Running subprocesses from hooks

Hooks frequently shell out — `prisma migrate deploy`, `redis-cli flushall`,
`docker exec`, custom scripts. Orquestra hooks run in the **main Node
process** (or in a worker, depending on scope), not under `pnpm`/`npm`.
That has one consequence developers stumble into:

> **`node_modules/.bin/` is NOT in `process.env.PATH`** when a hook calls
> `child_process.execSync` / `spawn`.

The hook itself can resolve a binary by absolute path. But if that binary
**transitively spawns another tool by name** — and that tool only lives in
`node_modules/.bin/` — the inner spawn fails with `ENOENT`. Classic
example: `prisma db seed` resolves fine, but it then `spawn("ts-node", ...)`
which is not in PATH.

Three patterns that work:

1. **Absolute paths or `pnpm`-prefixed commands**:
   ```ts
   execSync("./node_modules/.bin/prisma migrate deploy", { ... });
   ```

2. **Patch the `PATH` for the subprocess**:
   ```ts
   import path from "node:path";

   const env = {
     ...process.env,
     PATH: `${path.resolve("node_modules/.bin")}${path.delimiter}${process.env.PATH}`,
   };
   execSync("prisma db seed", { env });
   ```

3. **Skip the subprocess entirely** when you control both ends. Orquestra
   already loads TypeScript via jiti — importing your seed/setup code
   directly is faster, debuggable, and dependency-free:
   ```ts
   import { runSeeds } from "src/infra/database/prisma/seeds";

   afterProvision: async (ctx) => {
     await runSeeds({ databaseUrl: templateUrl });
   }
   ```

Pattern 3 is the most enterprise-grade: zero PATH magic, zero extra
processes, and a step in your seed becomes a stoppable breakpoint inside
the same `--debug` session as the rest of the suite.

---

## Library mode

You can use `WorkerOrquestra` directly without the runner — useful for
embedding inside other harnesses. The runner is the canonical entry point;
library mode is a power-user escape hatch and is not covered here in detail.
