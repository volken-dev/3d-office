# Imported from Volken — what came over, what didn't, what to decide

> Written 2026-10-22, from `volken-dev/Volken` `main`, `.claude/` and `CLAUDE.md`. Working state:
> delete this note once the open decisions below are settled and nothing here is still useful.

## What came over (adapted)

| Volken | Here | How it changed |
|---|---|---|
| `CLAUDE.md` | `CLAUDE.md` | Rewritten for this codebase; kept the shape (purpose, architecture, on-purpose decisions, non-negotiables, standing agreements, never-do list, definition of done, registration list). `AUDIT.md` plays the role of Volken's `STATE.md`. |
| `.claude/RULES.md` | `.claude/RULES.md` | Kept every generic rule (comments, naming, no `any`/casts/`var`, JSDoc, no barrels or junk-drawer files, validate at boundaries, fix-the-primitive, state coverage, anti-slop UI, copy rules, git hygiene, tech-debt and found-bug rules, verify-by-running, ambiguity handling). Replaced the domain sections with agents/LLM, state/scene, API and security rules for this app. |
| `BRANDING.md` | folded into RULES.md sections 8–9 | Only the brand-neutral parts: restraint, anti-slop list, voice, button and error copy, banned marketing words, "when in doubt". Volken's colours, fonts, Flint and terminology are not ours. |
| `hooks/check-user-facing-copy.mjs` + `settings.json` | same paths | Scoped to `apps/web/src/interface` and `components`. Dropped provider-name and T-number checks; added emoji, exclamation marks and AUDIT ids. Skips Tailwind `!` modifiers and masked-value placeholders. |
| `/health-check` `/ship` `/audit-deps` `/issue-from-todo` `/test-gaps` `/ui-review` `/registration-parity` `/plan-feature` `/implement-feature` `/new-hono-route` | same names | Gates are typecheck/lint/build (no tests yet); items are tracked in `AUDIT.md` and specs since GitHub issues are disabled; layers are this app's. |
| (new, analogue of the `/new-*` scaffolds) | `/new-agent-tool` | Scaffold for the one artifact this app adds most: an LLM tool. |

## Left behind, and why

- **Fly.io, Cloudflare, Neon, Drizzle, Inngest, Clerk, Upstash, Stripe, Resend** — every rule,
  runbook and gotcha about them. Not in this stack.
- **Commands:** `/db-migrate`, `/new-db-table`, `/new-db-query` (no database), `/new-inngest-function`
  (no job runner), `/new-cli-command` (no CLI), `/new-service` (no external-provider service
  layer; LLM providers live in `core/llm/providers/`), `/new-next-page` (single-page static app).
- **`agents/docs-writer.md` and `DOCS.md`** — Volken has a Fumadocs site; here the README is the
  docs. Worth reviving if a docs site appears.
- **`workflows/feature-slice.js`** — hard-wired to Volken's layers (schema → query → service →
  route → CLI/dashboard). Rewrite it around this app's layers if `/implement-feature` proves too
  slow for multi-layer work.
- **`notes/`, `runbooks/`, `specs/`, `STATE.md`, `VOLKEN_PROJECT.md`** — Volken-specific content.
- **Product rules:** provider-name ban, Forge/Calls/Endpoint terminology, Phase 2 scope list,
  tenancy (404 not 403), gateway transparency, secrets-metadata-only, margin-mechanism rule.
- **GitHub process:** issue tagging (`Type:`/`Phase:` labels, milestones, `[#N]` titles,
  `@isaac-dev0` assignee). Issues are disabled on `volken-dev/3d-office` and none of those labels
  exist here.
- **Volken's "never modify `.claude/` governance docs"** became "Isaac's instruction required", so
  these docs can be curated as you go.
- **Mid-phase audit cadence (Volken rule 88)** — kept only as "audits are working state" (rule 60);
  there are no phases here.

## Decisions

Settled on 2026-10-22:

- **Biome, not ESLint.** Volken's config (double quotes, no semicolons, trailing commas, 100
  columns, `organizeImports`), plus `noExplicitAny`, `noConsole`, unused variables and imports as
  errors; `apps/web` adds the `next` and `react` domains and excludes `src/components/ui` and
  `public/`. ESLint, `eslint-config-next` and `typescript-eslint` are removed, which also removed
  the braces advisory CI used to ignore. ESLint and Prettier are now on the banned list.
- **`strict: true` in `apps/web`**, with `@types/three` installed so the scene is typed (CODE-12).
- **GitHub issues are on**, with Volken's `Type:` and `Priority:` labels (minus `Phase:`, `Severity:`
  and the Volken-only ones) and its issue and PR templates, adapted. Issues are the tracker;
  `AUDIT.md` stays as the baseline audit record.

Still open:

1. **Test runner** (ARCH-09). Volken uses `bun test` with tests in `test/` mirroring `src/`; the
   convention is in RULES.md rule 7, ready for when a runner lands.
2. **Commitlint + lefthook.** Volken enforces Conventional Commits and runs lint/typecheck/tests
   pre-commit. Neither is installed here; RULES.md states the convention only.

## Found while importing

- `apps/web/src/interface/UIOverlayBubbles.tsx:64` shows "Project Ready!" (exclamation mark; the
  copy hook flags it).
- `apps/web/src/interface/ActionLogPanel.tsx:156` styles tab labels `uppercase tracking-widest`
  (an ALL-CAPS micro-label under the anti-slop rule).
