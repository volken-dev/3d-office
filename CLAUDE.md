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

The agent office in the browser (Three.js WebGPU, with a WebGL2 fallback): Isaac's office and
robot models, generated from code in `packages/office-assets`, with five robots, one per agent slot. The robots walk
in from the door; a live demo then gives each one a new agent state every 8 to 20 s, and it walks
to a POI for that state, plays the contract's enter clips and shows the state's status colour on
its body and its pod or bay light. Day and night follow the local clock (night 19:00 to 07:00).
A row of agent pills at the top selects a robot (Tab between them, or click a pill or a robot) and
the camera follows it; Esc or a click on empty floor returns to the overview. There is no player.
The web app is a static export served from the root of whatever host serves it; there is no
deploy pipeline. A minimal Hono API sits beside it, with a health route only.

Until 2026-10-24 this repo was "The Delegation", where LLM agents collaborated on software work in
the office. That product (agents, LLM gateway and providers, panels, team editor) was removed in
#81; git history has it. **The scene is shaped for a future agent product to drive**: its intents
follow the asset contract (cast slots, agent states, time of day), and the live demo in
`apps/web/src/integration/` is the stand-in that product replaces.

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
│   │   │                 GPU device-loss recovery, the agent pills
│   │   ├── data/         office-cast (the robots' slots), agent-states (the contract's state names)
│   │   ├── integration/  office-scene (builds the SceneManager, wires clicks, demo and clock),
│   │   │                 live-demo (the state scheduler), time-of-day (local clock to day/night),
│   │   │                 office-agents (external store: each slot's status and the selection),
│   │   │                 use-escape-to-overview (Esc), frame-stats
│   │   ├── interface/    agent-pills (ToggleGroup, one pill per robot), performance-overlay
│   │   │                 (development only, backquote key)
│   │   ├── components/   ui/ (shadcn primitives: alert, toggle, toggle-group)
│   │   ├── lib/          utils (cn only)
│   │   └── theme/        brand.ts
│   └── scripts/  copy-scene-assets (models into public/models before dev and build), csp
├── api/        Hono app, runtime-agnostic: app.ts (createApp), env.ts, errors.ts, routes/health
packages/
├── office-assets/ @the-delegation/office-assets: the models' source of truth, generated from
│               code (not shipped to the browser). src/robot (robot, robot-lite, minibot),
│               src/office (layout JSON, generator, procedural textures), src/compress (meshopt +
│               WebP), src/contract (the asset contract checker), scripts/ (`bun run models`).
│               README.md holds the world conventions and robot facts
├── office-sim/ @the-delegation/office-sim: how robots move, zod only (no three.js, no DOM).
│               Ported from agent-office's agent-sim.js, now the reference: asset-contract and office-extras
│               schemas, walk-grid, path-finding (A* + string pulling), office-world (POIs and
│               reservations), agent (OfficeAgent and its Actor port), agent-states, roster
├── scene/      @the-delegation/scene: the 3D scene, framework-free. scene-manager (driven by
│               SceneIntents and a SceneCast), scene-intent, scene-cast, core/ (engine, frame
│               profiler), office/ (model, world loader, lighting, ambient clip, status lights,
│               time of day), robots/ (robot-rig, three-actor, robot-picking), camera/
│               (office-camera: controls and follow), loaders. assets/ (models/office.glb,
│               models/robot.glb, asset-contract.json: built by office-assets)
└── shared/     @the-delegation/shared: zod contracts (api.ts: health response, error envelope)
```

### Decisions made on purpose — do not "fix" these

- **Static export, client-only scene.** Everything touching `three/webgpu` or `window` sits
  behind the `next/dynamic(..., { ssr: false })` boundary in `app/client-app.tsx`.
- **`packages/scene` stays framework-free.** It imports only itself, its `assets/`, three, zod
  and `@the-delegation/office-sim` (`test/scene-boundary.test.ts` enforces it). It reads no store
  and knows no React: the host hands it a `SceneCast` and `SceneEvents` and applies `SceneIntent`s.
  Host wiring lives in `apps/web/src/integration/`.
- **`packages/office-sim` is framework-free too**: zod only, no three.js, no DOM. It decides where
  robots go and which clips they play, and talks to rendering through its `Actor` port
  (`setPose`, `play`, `duration`), so it can run in a worker or behind Hono later. Movement
  changes go there, mirroring `viewer/agent-sim.js`, not into the scene.
- **The intents are contract-shaped**: `setCast`, `setAgentState` (a contract state name, checked
  against the office's `agentStates`), `setTimeOfDay` and `setViewMode`. They replaced the old
  agent-facing intents (desk, boardroom, chat, team) on purpose, with Isaac's agreement; a future
  agent product drives these.
- **Cast slots are pod, bay and status-texel numbers.** `SceneCast` is `{ agentIndices }`; slot N
  is pod N, docking bay N and status texel N, from 1 to the office's `agents.max`.
  `OFFICE_CAST` is `[1, 2, 3, 4, 5]`.
- **Models are generated, never hand-edited.** `office.glb` and `robot.glb` are the output of
  `packages/office-assets` (`bun run models` there); change a generator or the office layout and
  rebuild. `asset-contract.json` is edited by hand alongside a generator change (bump
  `contractVersion`: major = rename or removal, minor = addition) and the build checks the models
  against it. The robot build reads the source rig `packages/office-assets/rig/character-rig.glb`,
  a personal-use asset that stays local and gitignored; the shipped GLBs are committed, so dev, CI
  and builds never need it. Generators run under node (type stripping), not bun: bun's maths
  differs in the last bit and a rebuild should reproduce the committed files byte for byte. POIs are `poi-<kind>-<id>` nodes; the walk grid, approach points, agent
  states, status colours and slot count are scene extras parsed with zod at load.
- **The live demo is a stand-in.** `integration/live-demo.ts` picks the robots' states today; a
  future agent product replaces it with real states and the scene does not change.
- **React strict mode stays on.** It is the regression test for leaked scenes (REL-02): the dev
  double-mount must leave exactly one canvas.
- **The API is a local service.** No sign-in and none planned; it binds to `127.0.0.1` by default
  (`HOST` overrides it) and must not be exposed publicly. The web app does not call it today.
- **The 3D scene's look does not change** as a side effect of refactors. It is the original agent-office
  viewer's look (lighting, tone mapping, day and night), set on purpose in #87.

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
`apps/web/public/models` (gitignored) before every dev and build. To change a model, edit
its generator or `src/office/office-layout.json` in `packages/office-assets` and run
`bun run models` there (textures, robot, robot-lite, minibot, office, compression into
`packages/scene/assets/models`, the contract check and the movement test), then restart dev.
`.env*` files are gitignored except
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
- **Validate at every boundary with zod** — API route input, env, the office's scene extras and
  the asset contract.
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
  dead code rather than keeping it "for later".
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
- New or changed model → generated in `packages/office-assets` and listed in
  `packages/scene/assets/asset-contract.json`, then `bun run models` there; a new file name also
  goes in `SHIPPED_MODEL_PATHS` (`packages/office-assets/src/model-paths.ts`)

Run `/registration-parity` if unsure.
