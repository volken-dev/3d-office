---
description: List source files with no matching test in the package's test/ dir, prioritised by risk, so coverage holes are visible. Read-only.
argument-hint: "[web|api|scene|office-sim|shared]  (default: all)"
allowed-tools: Bash, Glob, Grep
---

Find source files that lack a test, per the repo convention: tests live in the package's `test/` dir mirroring `src/` (`src/lib/format.ts` -> `test/lib/format.test.ts`), never beside the source.

1. Scope to `$ARGUMENTS` if a package is named, else scan `apps/web/src`, `apps/api/src`, `packages/office-sim/src`, `packages/scene/src`, `packages/shared/src`.
2. For each non-test `.ts`/`.tsx` file at `src/<path>/<name>.ts(x)`, check whether `test/<path>/<name>.test.ts(x)` exists.
3. Exclude: type-only files (`*.d.ts`, `scene-cast.ts`, `scene-intent.ts`, `floor-point.ts`), re-export files, constant-only modules, shadcn `components/ui/*`, and the scene's GPU-only code (`packages/scene/src/core/`, `office/office-lighting.ts`, `camera/office-camera.ts`), which is verified in the browser instead.
4. Prioritise, in this order:
   - `packages/office-sim`: everything (contract and extras schemas, walk grid, path finding, POI slots and reservation, `OfficeAgent`, roster); it is pure and is the movement a future agent product relies on.
   - `packages/scene` logic that runs without a GPU: `office/` (world loader, status lights, time of day, ambient), `robots/` (rig, three-actor, picking), `scene-manager` intent handling, and the boundary and asset-contract tests.
   - The web integration: `live-demo`, `time-of-day`, `office-agents`, `office-scene`, `use-escape-to-overview`, and `data/` (`office-cast`, `agent-states`).
   - `apps/api` routes and their shared contracts.
   Pure view components (`interface/agent-pills.tsx`, `performance-overlay.tsx`) matter least.

Output a grouped list of untested files, each with a one-line note on why it's worth testing (or safe to skip). Don't write tests — just surface the gaps.
