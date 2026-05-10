---
"@orquestra/core": minor
"@orquestra/runner": minor
---

**Detect open handles.** Pass `--detect-open-handles` (or set
`detectOpenHandles: true` in `orquestra.config.ts`) to surface async
resources — timers, sockets, watchers, file descriptors — that a feature
opens but never closes. After each feature, the runner snapshots handles
created during the feature that still keep the event loop alive
(`hasRef()`), prints them to stderr with file:line and source, and serializes
the same payload into `artifact.json`:

- per feature, under `features[].openHandles`,
- aggregated under `summary.featuresWithOpenHandles` and
  `summary.totalOpenHandles` (only when detection was on, so consumers
  don't read `0` as "verified zero leaks").

Diagnostic only — leaks never fail the run. CLI flag wins over config;
`--no-detect-open-handles` force-disables. Cost is real (`async_hooks`
captures stack traces for every async resource), so leave it off for
normal runs.

New public types in `@orquestra/core`: `ArtifactOpenHandle`,
`ArtifactOpenHandleFrame`, plus the optional `openHandles` /
`featuresWithOpenHandles` / `totalOpenHandles` fields on existing
`ArtifactFeature` / `ArtifactSummary`. New optional `detectOpenHandles?:
boolean` on `OrquestraConfig`. All additive — no breaking changes.
