---
"@orquestra/core": major
"@orquestra/adapter-express": major
"@orquestra/adapter-fastify": major
---

Pluggable reporter API with versioned run artifacts.

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
