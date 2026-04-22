---
"@orquestra/runner": minor
"@orquestra/core": minor
"@orquestra/adapter-express": minor
"@orquestra/adapter-fastify": minor
---

Swap the internal TypeScript loader to SWC, respecting the project's `tsconfig.json`.

### `@orquestra/runner`

- **Transpile via SWC** — the runner now replaces jiti's default Babel pipeline
  with an SWC-based transformer. `tsconfig.json` is discovered from the
  `orquestra.config.ts` directory (walking upward) and mapped into SWC options
  automatically:
  - `experimentalDecorators: true` → legacy decorators + proper
    `transform-class-properties` ordering (fixes the long-standing
    `"Decorating class property failed"` error on Nest/TypeORM/class-validator
    projects).
  - `emitDecoratorMetadata: true` → `Reflect.metadata(...)` emission.
  - `target`, `baseUrl`, `paths`, `extends` are honored.
- **New CLI flag `--tsconfig <path>`** on `orquestra test` and `orquestra types`
  to override the auto-discovered `tsconfig.json`. Paths may be absolute or
  relative to the config directory.
- **Worker transpilation is cache-safe** — jiti's filesystem cache is disabled
  by default so upgrades never pick up stale Babel-transpiled artifacts.
- **`postbuild` chmod** ensures the published CLI bin keeps its executable bit.
- Error from `@swc/core` failing to load surfaces as `SwcNotAvailableError`
  pointing at a likely postinstall issue.
- Added `@swc/core` as a direct dependency.

### `@orquestra/core`

- **Container lifecycle logs are visible by default** — `Starting container:
  <name>` / `Container started: <name>` (same for stop) now log at `info`
  level instead of `debug`. Helpers, plugins, and macros still use `debug`.
- **Logger identifies the worker that emitted each line** — in parallel
  runs, log prefixes gain a `:W<id>` suffix when emitted from a forked
  worker (e.g. `[Orquestra:W0]`, `[TestDatabaseService:W1]`). The main
  process keeps the plain `[Orquestra]` prefix.

### Known limitations

- Output module format is always CommonJS.
- jiti's `import.meta.env` / `import.meta.paths` / `import.meta.resolve`
  helpers are not available under the SWC transformer.
