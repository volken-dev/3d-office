---
description: List source files with no matching test in the package's test/ dir, prioritised by risk, so coverage holes are visible. Read-only.
argument-hint: "[web|api|scene|shared]  (default: all)"
allowed-tools: Bash, Glob, Grep
---

Find source files that lack a test, per the repo convention: tests live in the package's `test/` dir mirroring `src/` (`src/lib/format.ts` -> `test/lib/format.test.ts`), never beside the source.

1. Scope to `$ARGUMENTS` if a package is named, else scan `apps/web/src`, `apps/api/src`, `packages/scene/src`, `packages/shared/src`.
2. For each non-test `.ts`/`.tsx` file at `src/<path>/<name>.ts(x)`, check whether `test/<path>/<name>.test.ts(x)` exists.
3. Exclude: type-only files (`types.ts`, `*.d.ts`), re-export files, constant-only modules, shadcn `components/ui/*`, and the scene's GPU rendering code (`packages/scene/src/core/`, materials and shaders), which is verified in the browser instead.
4. Prioritise: scene logic that runs without a GPU (behaviour and state machine, drivers, pathfinding, POI parsing and validation, cast helpers), the web integration (`office-cast`, `office-scene`), and `apps/api` routes and their shared contracts. Pure view components matter least.

Output a grouped list of untested files, each with a one-line note on why it's worth testing (or safe to skip). Don't write tests — just surface the gaps.
