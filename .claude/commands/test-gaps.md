---
description: List source files with no matching test in the package's test/ dir, prioritised by risk, so coverage holes are visible. Read-only.
argument-hint: "[web|api|shared]  (default: all)"
allowed-tools: Bash, Glob, Grep
---

Find source files that lack a test, per the repo convention: tests live in the package's `test/` dir mirroring `src/` (`src/lib/format.ts` -> `test/lib/format.test.ts`), never beside the source.

There is no test runner yet (ARCH-09). If no `test/` dirs exist, say so in one line, then still produce the prioritised list below as the plan for the first tests.

1. Scope to `$ARGUMENTS` if a package is named, else scan `apps/web/src/core`, `apps/web/src/integration`, `apps/web/src/lib`, `apps/api/src`, `packages/shared/src`.
2. For each non-test `.ts`/`.tsx` file at `src/<path>/<name>.ts(x)`, check whether `test/<path>/<name>.test.ts(x)` exists.
3. Exclude: type-only files (`types.ts`, `*.d.ts`), re-export files, constant-only modules, shadcn `components/ui/*`, and the 3D scene's rendering code in `simulation/` (verified in the browser instead).
4. Prioritise: `packages/agents` (tools, `ToolRegistry`, history rules, `AgentBrain` retry/budget policy, `orchestration/policy.ts`), `packages/llm` (adapters, router, registry pricing), store reducers and rehydrate validation in `integration/store`, and `apps/api` routes and middleware. Pure view components matter least.

Output a grouped list of untested files, each with a one-line note on why it's worth testing (or safe to skip). Don't write tests — just surface the gaps.
