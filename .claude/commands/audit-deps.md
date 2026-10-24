---
description: Audit deps — security advisories, unused/outdated, duplicates of in-repo helpers, plus license/maintenance/weight for anything new. Asks before changing.
allowed-tools: Bash, Read, Grep
---

Run a dependency audit across the monorepo and summarise. Don't change anything without my go-ahead.

1. **Banned deps (hard rule)** — ESLint, Prettier, any date library, lodash/underscore, axios. Biome replaces ESLint/Prettier; `Intl` replaces a date library; `fetch` or the typed `hc` client replaces axios.
2. **Avoidable deps** — scan every `package.json` for packages that duplicate something already in the repo or the platform: a second UI primitive library (shadcn primitives are the house choice), a second 3D or navigation library (we use `three` and recast-navigation). Flag and propose the in-repo replacement.
3. **Security** — run `bun audit` and summarise advisories by severity with the upgrade path. Note any `--ignore` added to the audit step in `.github/workflows/ci.yml` and whether its reason still holds.
4. **Unused / outdated** — list likely-unused deps per package (reason from imports) and `bun outdated` highlights. Be conservative: flag, don't auto-remove.
5. **Weight** — anything that lands in the web client bundle matters (the main chunk budget is open as AUDIT PERF-03; `three/webgpu` dominates it). Note heavy or eagerly imported packages.
6. For any dependency we're *considering adding*, report: license (compatible, no copyleft surprises), maintenance (last publish, open-issue health), and weight (transitive count, native bindings, bundle size).

Present a table and ask which to fix. Adding or removing a dep is gated on my confirmation, and `bun.lock` changes need my OK.
