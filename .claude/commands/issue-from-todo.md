---
description: Find bare TODO/FIXME and explanatory // comments, list them, and file GitHub issues (tagged at creation) for the ones I pick, or remove them.
allowed-tools: Grep, Bash, Read, Edit
---

RULES.md only allows `TODO(#NN)` linking an open issue, and bans explanatory `//` comments. Find the violations and offer to fix them.

1. Grep `apps/` and `packages/` (exclude `node_modules`, `.next`, `out`, `dist`) for `TODO`, `FIXME`, `HACK`, `XXX`.
2. Split into: (a) `TODO(#N)` whose issue is open (`gh issue view N`) → ignore; (b) `TODO(#N)` whose issue is closed, or `TODO(<AUDIT id>)` that `AUDIT.md` marks Fixed → stale, propose removing; (c) `TODO(<AUDIT id>)` still open → propose repointing to the issue that tracks it; (d) **bare** TODO/FIXME → candidates. Present them as a numbered list with `file:line` and the line.
3. Ask which to file. For each chosen one, search existing issues first (`gh issue list --search "<keywords>" --state all`) and show any likely duplicate. Create with `gh issue create` using the tech-debt template (`.github/ISSUE_TEMPLATE/tech_debt.md`), tagged at creation (`Type: Tech Debt` or `Type: Bug`, `Priority: Low` if it can wait, `--assignee isaac-dev0`), retitle it `[#N] <title>`, then rewrite the comment as `TODO(#N)`.
4. If I pass `comments`, also list explanatory `//` comments (not JSDoc, not `TODO(...)`, not `biome-ignore`/`@ts-expect-error`) grouped by file, and for the files I pick, refactor them away: rename, extract, or move the *why* into JSDoc on the enclosing function.

Never file or delete items I didn't pick. Run `gh` with `GITHUB_TOKEN` unset if a loaded `.env` defines one.
