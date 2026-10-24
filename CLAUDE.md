# CLAUDE.md — 3d-office

> Read this first, every session. For the full rule list read `.claude/RULES.md` (this file
> internalises the non-negotiables, it does not replace them). **Open work lives in GitHub issues**
> (`gh issue list`); `AUDIT.md` is the record of the baseline audit and what the refactors fixed —
> read both before proposing work, because the plan is the thing that drifts.
>
> Imported from Volken's `.claude/` on 2026-10-22 and adapted; what was left behind is in
> `.claude/notes/volken-import.md`. These docs are meant to be curated over time: when a rule
> turns out wrong or missing, say so and propose the edit.

## What this product is

A 3D office in the browser (Three.js WebGPU + TSL, with a WebGL2 fallback). You are a character
in it: click the floor to walk, click a seat to sit. A fixed cast of NPCs wanders, sits and idles
on its own; clicking one makes the camera follow it, and clicking empty space follows you again.
The web app is a static export served from the root of whatever host serves it; there is no
deploy pipeline. A minimal Hono API sits beside it, with a health route only.

Until 2026-10-24 this repo was "The Delegation", where LLM agents collaborated on software work in
the office. That product (agents, LLM gateway and providers, panels, team editor) was removed in
#81; git history has it. **The scene's agent-facing intents (work at a desk, gather in the
boardroom, chat turns, team replacement, design-mode pause) are kept on purpose for reuse** —
nothing drives them today, and that is not dead code to delete.

**Current goal: a stable, sound 3D office before any new feature.** If a task drifts into new
features, stop and confirm first.

---

## Architecture overview

Turborepo + Bun workspaces (`bun@1.3.11`, pinned in the root `package.json`).

```
apps/
├── web/        Next.js 16 App Router, output: 'export'
│   ├── src/
│   │   ├── app/          layout, page, client-app (the ssr:false boundary)
│   │   ├── app-shell.tsx the full-window canvas: scene lifecycle, load and error states,
│   │   │                 GPU device-loss recovery
│   │   ├── data/         office-cast (who is in the office and how they look)
│   │   ├── integration/  office-scene (builds the SceneManager, click-to-follow), frame-stats
│   │   ├── interface/    performance-overlay (development only, backquote key)
│   │   ├── components/   ui/ (shadcn primitives; only alert today)
│   │   ├── lib/          utils (cn only)
│   │   └── theme/        brand.ts
│   └── scripts/  copy-scene-assets (models into public/models before dev and build), csp
├── api/        Hono app, runtime-agnostic: app.ts (createApp), env.ts, errors.ts, routes/health
packages/
├── scene/      @the-delegation/scene: the 3D scene, framework-free. SceneManager (driven by
│               scene intents and a SceneCast), Engine, characters, behaviour, drivers, input,
│               pathfinding, world/POIs. assets/models (the GLBs the app serves), assets-src
│               (exported sources), scripts/ (`bun run assets`)
└── shared/     @the-delegation/shared: zod contracts (api.ts: health response, error envelope)
```

### Decisions made on purpose — do not "fix" these

- **Static export, client-only scene.** Everything touching `three/webgpu` or `window` sits
  behind the `next/dynamic(..., { ssr: false })` boundary in `app/client-app.tsx`.
- **`packages/scene` stays framework-free.** It imports only itself, three, recast-navigation and
  zod (`test/scene-boundary.test.ts` enforces it). It reads no store and knows no React: the host
  hands it a `SceneCast` and `SceneEvents` and applies `SceneIntent`s. Host wiring lives in
  `apps/web/src/integration/`.
- **The scene's unused intents stay.** See above; they will be driven again later.
- **Cast indices are POI slots.** A cast member's `index` picks its `spawn-<slot>` and
  `desk-<slot>` in the office GLB, so `OFFICE_CAST` indices must match the slots the office has.
- **React strict mode stays on.** It is the regression test for leaked scenes (REL-02): the dev
  double-mount must leave exactly one canvas.
- **The API is a local service.** No sign-in and none planned; it binds to `127.0.0.1` by default
  (`HOST` overrides it) and must not be exposed publicly. The web app does not call it today.
- **The 3D scene's look does not change** as a side effect of refactors.

---

## Local development

```
bun install
bun run dev         # turbo: web on :3000 (localhost only), api on :8787
bun run typecheck   # tsc --noEmit per package
bun run lint        # biome check per package
bun run test        # bun test per package (tests in each package's test/ dir)
bun run format      # biome format --write per package
bun run build       # static export to apps/web/out (+ CSP postbuild), api bundle
```

`bun run dev:lan` in `apps/web` opts in to binding on the network. Press the backquote key in a
dev build for render stats. The models live in `packages/scene/assets/models` and are copied into
`apps/web/public/models` (gitignored) before every dev and build; after re-exporting a model, run
`bun run assets` in `packages/scene` and restart dev. `.env*` files are gitignored except
`.env.example`.

CI (`.github/workflows/ci.yml`) runs on pull requests and pushes to `main`: installs with
`--frozen-lockfile`, audits, typechecks, lints, tests, builds and greps the build output for API
keys. Nothing deploys.

---

## Rules and non-negotiables

Internalised from `.claude/RULES.md` — read it for the full set.

- **No `any`.** Use `unknown` and narrow. No `as` casts to force a shape: parse with zod. Every
  package is `strict: true`, the scene included (`@types/three`).
- **No inline `//` comments.** Only allowed: JSDoc on functions and exports (the *why*),
  `TODO(#NN)` linking an open issue, and tool directives (`biome-ignore`, `@ts-expect-error`).
  If a line isn't obvious, refactor it — rename, extract, restructure — don't annotate it.
- **Full, descriptive names.** No single-letter or abbreviated identifiers (trivial loop counters
  and `(a, b)` comparators excepted). `agentIndex`, never `idx`.
- **kebab-case file and folder names** in every package (`office-scene.ts`,
  `performance-overlay.tsx`); identifiers inside keep their casing. Biome's
  `useFilenamingConvention` enforces it.
- **No `console.log`** for application events; `console.warn`/`console.error` only on real error
  paths (Biome's `noConsole` enforces this).
- **Validate at every boundary with zod** — API route input, env, model extras from the GLB.
- **No barrels and no junk-drawer files.** No new `index.ts` re-export files; no `utils.ts` /
  `helpers.ts` / `misc.ts` (the shadcn `lib/utils.ts` exporting `cn()` is the one exception).
  One responsibility per file; name it for what it does.
- **UI:** compose shadcn `components/ui/*` primitives — never hand-roll interactive HTML. Visual
  variation is a `cva` `variant`/`size` on the primitive, not an appearance `className` at the
  call site. Theme tokens from `globals.css` only — no raw hex, no hard-coded `zinc-*`.
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
  relevant code, open issues and `AUDIT.md` to confirm it isn't already built, already decided, or
  explicitly open. Never propose from memory alone.
- **Fix small breakages now.** Red CI or a small, well-understood blocker found mid-task gets fixed
  straight away. Protected files (`bun.lock`, `.env*`) still need Isaac's OK; anything larger
  comes to him.
- **Fix what you find; leave nothing broken silently.** A bug found during unrelated work is fixed
  when safe and in reach, or filed as a `Type: Bug` / `Type: Tech Debt` issue when it is risky or
  large. Never walk past a known defect without saying so.
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
- **Don't model speculatively.** No state, type or field that shipping code doesn't read. Remove
  dead code rather than keeping it "for later" — the scene's agent-facing intents are the one
  agreed exception.
- **Don't modify without explicit instruction:** `.claude/` governance docs (this file, RULES.md),
  `AUDIT.md`'s findings tables (flipping a Status is fine), theme tokens in `globals.css` /
  `theme/brand.ts`, `.env*`, `bun.lock`.
- **Don't add a dependency without asking**, with a one-line justification (`/audit-deps`).
- **Don't run without confirmation:** adding a deploy pipeline, `git push --force`, destructive
  git commands (`reset --hard`, `clean`, `checkout -- <file>`).
- **Don't change the 3D scene's visuals** as a side effect of other work.

---

## Claude Code workflow shortcuts

Slash commands live in `.claude/commands/`. Plan and build: `/plan-feature` `/implement-feature`
`/new-hono-route`. Operate: `/health-check` `/ship` `/registration-parity` `/audit-deps`
`/issue-from-todo` `/test-gaps` `/ui-review`.

### Definition of done (before claiming a task complete)

A task is DONE only when all of these pass — use `/health-check` for the first five:
1. `bun run typecheck` — green
2. `bun run lint` — green
3. `bun run test` — green
4. `bun run build` — green (the static export and CSP postbuild)
5. `git status` clean of unintended files; not committing on `main`
6. **Verified by running it**: the change was exercised the way a person meets it (the office in a
   browser via `bun run dev`, or the API over HTTP), and the PR's **Verified** section says what
   was run and what was seen. Typecheck alone doesn't count. When something can't be exercised
   locally, say which part and why.

Never report success with a red gate; if a gate fails, show the exact `file:line`, not a summary.

### When you add an artifact, register it

- New API route group → `.route('/<name>', <name>)` in `createApp` (`apps/api/src/app.ts`), with
  its request and response schemas in `@the-delegation/shared`
- New character model → an entry in `packages/scene/src/characters/character-models.ts`, its GLB
  in `assets-src/models`, then `bun run assets` in `packages/scene`

Run `/registration-parity` if unsure.
