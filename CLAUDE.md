# CLAUDE.md — The Delegation (3d-office)

> Read this first, every session. For the full rule list read `.claude/RULES.md` (this file
> internalises the non-negotiables, it does not replace them). **Open work lives in GitHub issues**
> (`gh issue list`); `AUDIT.md` is the record of the baseline audit and what this refactor fixed —
> read both before proposing work, because the plan is the thing that drifts.
>
> Imported from Volken's `.claude/` on 2026-10-22 and adapted. What was left behind, and the
> decisions still to make, are in `.claude/notes/volken-import.md`. These docs are meant to be
> curated over time: when a rule turns out wrong or missing, say so and propose the edit.

## What this product is

The Delegation is a 3D office in the browser (Three.js WebGPU + TSL) where Gemini-powered LLM
agents collaborate on software-development work: the user sets a brief, a lead agent proposes
tasks, team agents pick them up, and the lead delivers a final output for the user to review.
Users bring their own Gemini key (BYOK). The site is a static export served from the root of
whatever host serves it; there is no deploy pipeline.

**Current goal: stability and sound architecture before any new feature.** Close the reliability,
security and architecture issues (and `AUDIT.md`'s open items) before building anything new. If a
task drifts into new features, stop and confirm first.

---

## Architecture overview

Turborepo + Bun workspaces (`bun@1.3.11`, pinned in the root `package.json`).

```
apps/
├── web/        Next.js 16 App Router, output: 'export'
│   └── src/
│       ├── app/          layout, page, client-app (the ssr:false boundary)
│       ├── core/         framework-free domain: agent/ (AgentBrain, PromptBuilder, ToolRegistry,
│       │                 tools/), llm/ (providers, pricing, errors), orchestration/ (ports, policy),
│       │                 project/ (types)
│       ├── integration/  adapters from core to React/Zustand: store/ (coreStore, uiStore,
│       │                 teamStore), orchestration/zustandDeps, settings/, hooks/
│       ├── simulation/   the 3D scene: SceneManager, Engine, characters, pathfinding, AgentSimulation
│       ├── interface/    React panels and modals
│       ├── components/   ui/ (shadcn primitives) + shared components (Markdown, ExternalLink)
│       ├── data/         team templates (agents.ts)
│       ├── lib/          asset, storage, clipboard, format, api-client, utils (cn only)
│       └── theme/        brand.ts
├── api/        Hono app, runtime-agnostic (prepared, not yet used by the UI)
│   └── src/    app.ts, env.ts, errors.ts, routes/, middleware/, llm/
packages/
└── shared/     @the-delegation/shared: zod API contract (api.ts, llm.ts)
```

### Decisions made on purpose — do not "fix" these

- **Static export, client-only scene.** Everything touching `three/webgpu`, `window` or storage
  sits behind the `next/dynamic(..., { ssr: false })` boundary in `app/client-app.tsx`. Storage
  access goes through `lib/storage.ts`; assets resolve through `lib/asset.ts`.
- **`core/` stays framework-free.** Agent logic depends on ports (`core/orchestration/ports.ts`),
  not on Zustand or the scene. The Zustand adapter lives in `integration/`. New domain code goes in
  `core/` behind a port; never import a store from `core/`.
- **One retry policy, in `AgentBrain`.** Exponential backoff, a cap on unproductive attempts, a
  per-project call and task budget, and an immediate pause on quota/auth errors. Do not add a
  second retry loop anywhere else (one was removed for silently racing this one).
- **LLM tool calls are untrusted input.** Every tool parses its arguments and checks it is offered
  to that agent in that phase (`ToolRegistry.runToolCall`). LLM output is untrusted when rendered
  too: Markdown goes through `components/Markdown.tsx` only (no raw HTML, no remote images).
- **React strict mode stays on.** It is the regression test for leaked simulations (REL-02).
- **The API is prepared, not wired.** The app is BYOK today. Moving key custody server-side is a
  tracked item (SEC-01, ARCH-07), not something to start incidentally.
- **The 3D scene's look does not change** as a side effect of refactors.

---

## Local development

```
bun install
bun run dev         # turbo: web on :3000 (localhost only), api
bun run typecheck   # tsc --noEmit per package
bun run lint        # biome check per package
bun run format      # biome format --write per package
bun run build       # static export to apps/web/out (+ CSP postbuild)
```

`bun run dev:lan` in `apps/web` opts in to binding on the network. `.env*` files are gitignored
except `.env.example`.

CI (`.github/workflows/ci.yml`) runs on pull requests and pushes to `main`: installs with
`--frozen-lockfile`, audits, typechecks, lints, builds and greps the build output for API keys.
Nothing deploys.

---

## Rules and non-negotiables

Internalised from `.claude/RULES.md` — read it for the full set.

- **No `any`.** Use `unknown` and narrow. No `as` casts to force a shape: parse with zod. Every
  package is `strict: true`, the scene included (`@types/three`).
- **No inline `//` comments.** Only allowed: JSDoc on functions and exports (the *why*),
  `TODO(#NN)` linking an open issue, and tool directives (`biome-ignore`, `@ts-expect-error`).
  If a line isn't obvious, refactor it — rename, extract, restructure — don't annotate it.
- **Full, descriptive names.** No single-letter or abbreviated identifiers (trivial loop counters
  and `(a, b)` comparators excepted). `agentIndex`, never `idx`; `task`, never `t`.
- **No `console.log`** for application events; `console.warn`/`console.error` only on real error
  paths (Biome's `noConsole` enforces this). Never log the user's API key or raw prompts.
- **Validate at every boundary with zod** — persisted storage on rehydrate, LLM tool arguments,
  API route input, env.
- **No barrels and no junk-drawer files.** No new `index.ts` re-export files; no `utils.ts` /
  `helpers.ts` / `misc.ts` (the shadcn `lib/utils.ts` exporting `cn()` is the one exception).
  One responsibility per file; name it for what it does.
- **UI:** compose shadcn `components/ui/*` primitives — never hand-roll interactive HTML
  (`<button>`, `<input>`, `<select>`). Visual variation is a `cva` `variant`/`size` on the
  primitive, not an appearance `className` at the call site. Theme tokens from `globals.css`
  only — no raw hex, no hard-coded `zinc-*`. Destructive actions confirm through `ConfirmDialog`;
  async results are toasts (sonner).
- **User-facing copy:** no em/en-dashes or bullet glyphs in strings, no emoji, no exclamation
  marks. The copy hook (`.claude/hooks/check-user-facing-copy.mjs`) catches string literals.
- **Biome** (not ESLint/Prettier) lints and formats: double quotes, no semicolons, trailing
  commas, 2-space indent, 100 columns. Don't hand-tune against it.
- **Workflow:** one task per session → PR to `main` with `Closes #N`. Every task has a GitHub
  issue; file it yourself when one is missing, tagged at creation. Flag tech debt the moment you
  spot it, as a `Type: Tech Debt` issue.

---

## Standing agreements

Carried over from Volken; these are how Isaac wants work done.

- **Check what exists before suggesting.** Before proposing a feature, change or approach, read the
  relevant code, open issues and `AUDIT.md` to confirm it isn't already built, already decided, or explicitly
  open. Never propose from memory alone.
- **Fix small breakages now.** Red CI or a small, well-understood blocker found mid-task gets fixed
  straight away. Protected files (`bun.lock`, `.env*`) still need Isaac's OK; anything larger
  comes to him.
- **Fix what you find; leave nothing broken silently.** A bug found during unrelated work is fixed
  when safe and in reach, or filed as a `Type: Bug` / `Type: Tech Debt` issue when it is risky or
  large. Never walk past a
  known defect without saying so.
- **No closing keywords by accident.** GitHub matches `fix`, `close`, `resolve` before `#N`
  loosely. Refer to issues you aren't closing with "Refs #N", and after a merge that names issues,
  check none closed unexpectedly.
- **Run `gh` with `GITHUB_TOKEN` unset** (`unset GITHUB_TOKEN; gh ...`) if a loaded `.env` ever
  defines one; it makes `gh` fail with 401.
- **Restrained UI, not AI-generated-looking UI.** No accent border stripes, gimmick coloured bars,
  ALL-CAPS micro-labels, hero metrics or single-point charts; show each fact once; look at real
  pixels before calling a redesign better.
- **Parallel sessions may share a checkout.** If another Claude session is busy in this folder, do
  git work in your own `git worktree add ../3d-office-<task> -b <branch> origin/main`, check
  `git reflog -5` before committing, and message the other session if you collide. Never reset or
  commit another session's work.

---

## Things Claude must never do

- **Don't build new features** while the stability goal stands, without confirming first.
- **Don't model speculatively.** No state, type, port or store field that shipping code doesn't
  read. Remove dead state rather than keeping it "for later".
- **Don't modify without explicit instruction:** `.claude/` governance docs (this file, RULES.md),
  `AUDIT.md`'s findings tables (flipping a Status is fine), theme tokens
  in `globals.css` / `theme/brand.ts`, `.env*`, `bun.lock`.
- **Don't add a dependency without asking**, with a one-line justification (`/audit-deps`).
- **Don't run without confirmation:** adding a deploy pipeline,
  `git push --force`, destructive git commands (`reset --hard`, `clean`, `checkout -- <file>`).
- **Don't change the 3D scene's visuals** or the retry/budget policy as a side effect of other work.

---

## Claude Code workflow shortcuts

Slash commands live in `.claude/commands/`. Plan and build: `/plan-feature` `/implement-feature`
`/new-hono-route` `/new-agent-tool`. Operate: `/health-check` `/ship` `/registration-parity`
`/audit-deps` `/issue-from-todo` `/test-gaps` `/ui-review`.

### Definition of done (before claiming a task complete)

A task is DONE only when all of these pass — use `/health-check` for the first four:
1. `bun run typecheck` — green
2. `bun run lint` — green
3. `bun run build` — green (the static export and CSP postbuild)
4. `git status` clean of unintended files; not committing on `main`
5. **Verified by running it**: the change was exercised the way a person meets it (the app in a
   browser via `bun run dev`, or the API over HTTP), and the PR's **Verified** section says what was
   run and what was seen. Typecheck alone doesn't count. When something can't be exercised locally,
   say which part and why.

There is no test runner yet (issue for ARCH-09). Never report success with a red gate; if a gate fails, show
the exact `file:line`, not a summary.

### When you add an artifact, register it

- New agent tool → add `register(<tool>)` to `TOOLS` in `apps/web/src/core/agent/ToolRegistry.ts`
  (order is the order the model sees them)
- New API route group → `.route('/<name>', <name>)` in `apps/api/src/app.ts`, with its request and
  response schemas in `@the-delegation/shared`

Run `/registration-parity` if unsure.
