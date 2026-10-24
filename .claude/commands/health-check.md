---
description: Run the done-gate — typecheck, lint, test, build, clean tree + branch check — and report pass/fail per gate. Never declare done while red.
argument-hint: "[--fix] [web|api|scene|office-sim|shared]"
allowed-tools: Bash, Read
---

Run the "definition of done" gate and report a PASS/FAIL table. Do NOT say a task is done unless every gate passes.

Run in order from the repo root, capturing output (scope with `--filter=<package>` if I name one in `$ARGUMENTS`):
1. **Types** — `bun run typecheck` (turbo runs `tsc --noEmit` per package).
2. **Lint** — `bun run lint` (`biome check` per package). If `$ARGUMENTS` contains `--fix`, first run `bun run lint:fix` (safe fixes + format), then re-run lint.
3. **Tests** — `bun run test` (`bun test` per package).
4. **Build** — `bun run build` (the static export plus the CSP postbuild). Skip only if I say so.
5. **Tree/branch** — `git status --porcelain` and `git branch --show-current`. FAIL the tree check if there are stray modified/untracked files you didn't intend; WARN loudly if the current branch is `main`.

These gates do not replace verification (RULES.md rule 52): a green table says the code compiles, lints and builds, not that the change works. Say so if the change has not yet been exercised in the running office or over HTTP.

Output: a compact table of gate | result | first failing detail. On any failure, stop and show the smallest repro (the exact failing file:line). Never report success with a red gate.
