# @orquestra/adapter-fastify

## 1.0.0

### Major Changes

- dc71605: Pluggable reporter API with versioned run artifacts.

  - **Breaking**: `orquestra.teardown()` no longer prints the BDD report automatically.
    Reporting is now opt-in via `orquestra.report(new OrquestraConsoleReporter())`.
  - **Breaking**: `OrquestraConsoleReporter.run()` is no longer a static method.
    Create an instance and pass it to `orquestra.report()`.
  - Added abstract `OrquestraReporter` base class for custom reporters (HTML, JSON, etc.).
  - Added `manifest.json` and `meta.json` artifacts under `.orquestra/<runId>/` for
    versioned, retroactive reporting.
  - Added `historyLimit` option (default `1`) to prune old runs on `start()`.
  - Added semver compatibility checks: different major aborts report, different minor warns.
  - New public exports: `OrquestraReporter`, `OrquestraConsoleReporter`, `FeatureMeta`,
    `RunManifest`, `StepEvent`, `StepStatus`.

### Patch Changes

- Updated dependencies [dc71605]
  - @orquestra/core@1.0.0

## 0.2.0

### Minor Changes

- added bdd API and macros support

### Patch Changes

- Updated dependencies
  - @orquestra/core@0.2.0

## 0.1.0

### Patch Changes

- Updated dependencies
  - @orquestra/core@0.1.0

## 0.0.2

### Patch Changes

- fixed: typings, imports and build worflow
- Updated dependencies
  - @orquestra/core@0.0.2

## 0.0.1

### Patch Changes

- 95a5546: added: Orquestra core, adapter express and adapter fastify
- Updated dependencies [95a5546]
  - @orquestra/core@0.0.1
