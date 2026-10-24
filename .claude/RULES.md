# RULES.md — 3d-office

> These rules are non-negotiable. Follow them in every session without exception.
> If a user instruction conflicts with a rule, **flag the conflict before proceeding** — do
> not silently comply, and do not silently refuse.
>
> Read `CLAUDE.md` first every session, open GitHub issues for what is still to do, and `AUDIT.md`
> for the baseline audit and what has been fixed.
> `CLAUDE.md` describes *what the system is*; this file is *what you must and must not do*.
> Adapted from Volken's RULES.md on 2026-10-22; see `.claude/notes/volken-import.md` for what was
> left out and why. The agent and LLM rules went with the agent product in #81 (2026-10-24).

---

## Core principles

These three govern everything below. When a specific rule is missing, decide by these.

- **P1 — Validate at every boundary; fail loud on bad input.** API route input, env, the scene
  extras read from the office GLB and the asset contract. A malformed boundary is a hard, visible failure (or a safe fallback
  that says so), never a silent filter.
- **P2 — Keep the layers apart.** `packages/office-sim` decides how robots move and imports only
  zod (no three.js, no DOM). `packages/scene` renders and imports only itself, its assets, three,
  zod and `@the-delegation/office-sim` (a boundary test enforces it); it reads no store and knows
  no React. `apps/web/src/integration/` wires it to the app and decides what states robots are in. `apps/api` is runtime-agnostic and shares its
  contracts through `packages/shared`.
- **P3 — Fix what you find; leave nothing broken silently.** If you discover a bug during any
  task — even one you did not cause — fix it when it is safe and in reach, or file a `Type: Bug` /
  `Type: Tech Debt` issue when it is risky or large. Never walk past a known defect and say nothing.

---

## 1. File, structure, and naming

1. **One responsibility per file.** One route group per file in `apps/api/src/routes/`, one
   component per file in `interface/`, one concern per module in `packages/scene` and
   `packages/office-sim`.
2. **No barrel files.** Never add an `index.ts` that re-exports a directory. Packages expose modules
   through subpath exports (`@the-delegation/scene/scene-manager`,
   `@the-delegation/shared/api`). The single permitted barrel-like file is the shadcn
   `lib/utils.ts` exporting `cn()`.
3. **Never create `utils.ts`, `helpers.ts`, or `misc.ts`.** Name a file for what it does.
4. **File and folder names are kebab-case, everywhere** (`scene-manager.ts`,
   `performance-overlay.tsx`), whatever the file exports; identifiers inside keep their own casing
   (`class SceneManager`). Biome's `useFilenamingConvention` enforces it. Next.js reserved names
   (`page.tsx`, `layout.tsx`) already comply.
5. **Full, descriptive names.** No single-letter or abbreviated identifiers. `agentIndex`, never
   `idx`; `(member) => ...`, never `(m) => ...`. Exceptions: a trivial numeric loop counter, and
   `(a, b)` in a sort comparator.
6. **Use `function` declarations for named and exported functions.** Reserve arrow functions for
   callbacks and inline expressions.
7. **Tests live in a per-package `test/` dir mirroring `src/`** (`src/data/office-cast.ts` →
   `test/data/office-cast.test.ts`), never beside the source. They run with `bun test` through
   `bun run test`, locally and in CI.

## 2. Code style

8. **Biome does both lint and format** (root `biome.json`, extended per package; ESLint and
   Prettier are banned). Style: **double quotes, no semicolons, trailing commas everywhere, 2-space
   indent, 100-char line width**, imports ordered by Biome's `organizeImports`. Do not hand-tune
   against it. `noExplicitAny`, `noConsole` (warn/error allowed), unused variables and imports are
   errors. `src/components/ui` (shadcn) and `public/` are excluded. Run `bun run lint` and
   `bun run typecheck` before committing; `bun run lint:fix` applies safe fixes.
9. **No inline `//` comments.** The only permitted comments are: JSDoc blocks on functions,
   classes and exports (the *why* / contract), `// TODO(#NN)` linking an open issue (remove or
   repoint it when that item closes), and tool directives (`// biome-ignore <rule>: <reason>`,
   `// @ts-expect-error`). If a line is not obvious, refactor it — rename, extract, restructure —
   do not annotate it with prose. When you touch a file that has explanatory `//` comments, turn
   the useful ones into JSDoc or better names and delete the rest.
10. **No commented-out code, no narrating comments, no stale comments.** Git keeps history.

## 3. TypeScript

11. **No `any`.** Use `unknown` and narrow. `strict: true` in every package, the 3D scene
    included: TSL nodes get their real generic types from `@types/three`.
12. **No `as` / `as unknown as` casts to force a shape.** Parse with zod and let the type flow
    from the parse. This applies especially to API bodies and data read from model files. A
    narrowing `as` after a runtime check that TS cannot follow is acceptable.
13. **No `var`.** `const` by default, `let` only when reassigned.
14. **Explicit return types where they clarify the contract:** exported functions returning
    scalars, `void`, unions or `null`-unions, and the public API of `@the-delegation/shared`.
    Infer complex returns.
15. **Every exported function gets a JSDoc block** explaining intent and contract — the *why*,
    not the *what*. Add `@param`/`@returns` only when names and types do not already convey it.

## 4. The scene

16. **The scene is driven, not wired.** The host builds a `SceneCast`, passes `SceneEvents`, and
    calls `apply(intent)` with the contract-shaped intents (`setCast`, `setAgentState`,
    `setTimeOfDay`, `setViewMode`). Never import a store, React or app code into `packages/scene`,
    and never make it decide what an agent state means or when it is night. Rendering lives in the
    scene (`office/`, `robots/`, `camera/`, `core/`); movement lives in `packages/office-sim`,
    reached through its `Actor` port, and follows agent-office's `viewer/agent-sim.js`.
17. **Per-frame data never goes through React state or a store.** Write it to a sink the render
    loop owns (`publishFrameStats`, throttled) and let consumers read it without re-rendering.
    Status changes reach the UI as events (`onAgentStatus`), not per frame.
18. **Everything the scene creates, it disposes**: GPU resources, listeners, timers, subscriptions,
    the canvas, the animation loop. A disposed object never starts new work.
19. **Fire-and-forget async is wrapped** so a rejection is routed to an error state, never left
    unhandled.
20. **Do not change the 3D scene's visuals** as a side effect of other work. The models and the
    asset contract are synced from agent-office (`bun run assets`) and never hand-edited; a
    contract of another major version is refused until the code is updated for it.
21. **Cast indices are agent slots, 1 to `agents.max`.** Slot N is pod N, docking bay N and status
    texel N. Do not assume the cast is contiguous or always full; read the limit from the office's
    `agents` extras, not a constant.

## 5. API (`apps/api`)

22. **Runtime-agnostic.** No Bun, Node or Workers globals in `app.ts` or routes; the entry point
    adapts. Env is read through the typed `AppEnv` bindings.
23. **Validate input with zod against `@the-delegation/shared`** schemas, and type responses with
    them too.
24. **Errors go through `errors.ts`** (`handleError`, `errorBody`): one error envelope, a request
    id. Never leak stack traces or raw upstream messages to the client.
25. **Middleware order:** request id → secure headers app-wide; a route group that reads a body
    adds a body limit and a validator before any handler reads it.
26. **Gate dev-only behaviour on an explicit development check**, never `!== 'production'`.

## 6. Security

27. **No secrets in the web bundle.** Nothing secret goes in a `NEXT_PUBLIC_*` variable or Next
    `env`; CI greps the build output for Google, Anthropic and OpenAI key prefixes; keep it that
    way.
28. **Keep the CSP intact** (`scripts/csp.mjs`). A new inline script or remote origin is a CSP
    change and needs a reason.
29. **The API is local.** It binds to `127.0.0.1` by default and must not be exposed publicly
    without access control.

## 7. UI (`apps/web/src/interface`, `components/`)

30. **Always compose shadcn `components/ui/*` primitives.** Never hand-roll interactive HTML
    (`<button>`, `<input>`, `<select>`, `<textarea>`). Every modal is a `Dialog` / `AlertDialog`.
    Add a primitive with the shadcn CLI when one is needed (that is a dependency change: ask).
31. **Fix the primitive, not the call site.** Visual variation is a `cva` `variant`/`size` on the
    primitive; layout classes (margin, width, grid placement) may be passed via `className`. To
    add a look, add a variant. Promote a one-off to a variant the second time it appears.
32. **Tailwind utilities and theme tokens only.** Colours come from `globals.css` tokens
    (`--primary`, `--user`, `--success`, `--destructive`, ...); no raw hex, no hard-coded
    `zinc-*`. `style={{}}` only for computed or data-driven values (a drag size, a screen
    position).
33. **State coverage is mandatory:** loading is visible; errors say what happened and what to do
    next; destructive actions confirm; dismissing a dialog never destroys data.
34. **Keyboard and screen-reader access** for every interactive element.
35. **Boring or generic UI is a defect, but so is slop.** No accent border-stripes, gimmick
    coloured bars, ALL-CAPS micro-labels, hero metrics, single-point charts, decorative icons, or
    the same fact shown twice. Default to restraint: fewer colours, smaller type, more spacing.

## 8. User-facing copy

36. **No em/en-dashes (`—`, `–`) or bullet glyphs (`•`, `‣`, `·`) in copy strings.** Rewrite with
    commas, full stops or parentheses; real lists use list markup. Internal docs may use them.
37. **No emoji and no exclamation marks** in product UI.
38. **Voice:** second person, active voice, present tense, short sentences. Say what happened,
    then the next step. Never "Something went wrong".
39. **Button labels are verb-first, sentence case** ("Reload", "Check again"); pending states are
    present participles ("Loading...").
40. **Banned words:** seamless, revolutionary, cutting-edge, leverage, empower, unlock,
    supercharge, delightful, world-class, next-generation, synergy.
41. **No internal ids** (`REL-07`, `ARCH-03`) in user-facing copy.

## 9. Git and task workflow

42. **Branches:** `feat/…`, `fix/…`, `refactor/…`, `perf/…`, `chore/…`, `docs/…`.
43. **Commits:** Conventional Commits, imperative, lowercase, no trailing period. Optional scope
    `web`, `api`, `scene`, `office-sim`, `shared` or `repo` (`repo` for root tooling and `.claude/`). One
    logical change per commit.
44. **PRs target `main`** using the PR template: `Closes #N` for each issue closed (`Refs #N` for
    partial work), a **Verified** section (what was run and what was seen), and any `AUDIT.md` ids
    addressed. The PR title is the Conventional Commits summary.
45. **Every task has a GitHub issue; file it yourself** when none exists, without asking first,
    using the templates in `.github/ISSUE_TEMPLATE/`. **Tag at creation:** a `Type:` label (`Bug`,
    `Feature`, `Chore`, `Design`, `Tech Debt`, `Security`, `Infra`, `Performance`), plus
    `Priority: High` / `Priority: Low` where it applies, and the `@isaac-dev0` assignee. Don't
    invent new labels without asking. Title every issue `[#N] <title>` (create it, then
    `gh issue edit N --title` straight away; issues only, not PRs).
46. **One task per session:** complete it, verify it, commit on its branch, open the PR, flip the
    Status of any `AUDIT.md` item it closes, then stop. Don't start the next task until the merge
    is confirmed.
47. **Commit or push only when asked.** If on `main`, branch first.
48. **Never put `fix` / `close` / `resolve` directly before an issue or PR number** you aren't
    closing. Use "Refs #N".

## 10. Tech debt and found bugs

49. **Surface tech debt, deprecations and suboptimal patterns the moment you spot them**, as a
    tagged `Type: Tech Debt` issue with acceptance criteria.
50. **Fix bugs you discover** (P3).
51. **Findings qualified with "after benchmarking", "consider", or "decide" are deferrals, not
    work orders.** File a `Type: Tech Debt` issue; don't make the change.

## 11. Verification

52. **Verify every change by running it, and say how in the PR.** Typecheck and lint passing is
    not verification. Exercise the change the way a person meets it: the office in a browser via
    `bun run dev` (with StrictMode on), or the API over HTTP. Scene changes are checked on WebGPU,
    and on the WebGL2 fallback when they touch rendering.
53. **Audits are working state.** A mid-stream audit (security, UX, performance) produces
    severity-rated findings with a resolution map, and the doc shrinks as findings close.

---

## What Claude must never do

These are absolute. No exception without an explicit, in-session user instruction.

1. **Never use `any`**, `var`, or an `as` / `as unknown as` cast to force a shape.
2. **Never `console.log` application events**, and never log secrets.
3. **Never write inline `//` explanatory comments** (JSDoc, linked `TODO(...)` and tool directives
   only).
4. **Never use single-letter or abbreviated names** outside the two exceptions in Rule 5.
5. **Never add a barrel `index.ts`**, and never create `utils.ts` / `helpers.ts` / `misc.ts`.
6. **Never hand-roll interactive HTML** or override a shadcn primitive at the call site.
7. **Never use em-dashes, bullet glyphs, emoji or exclamation marks in user-facing copy.**
8. **Never import the app, React or a store from `packages/scene`**, and never three.js or the
   DOM from `packages/office-sim`.
9. **Never model speculatively** — no state field, type or option that shipping code doesn't
   read.
10. **Never add a dependency without confirmation**, and never add a banned one: ESLint, Prettier,
    a date library (use `Intl`), lodash/underscore, axios (use `fetch` or the typed `hc` client).
11. **Never modify without explicit instruction:** `CLAUDE.md`, this file, theme tokens,
    `.env*`, `bun.lock`.
12. **Never run without confirmation:** a push to `main`, a force push, or destructive
    git commands.
13. **Never build new features** while the stabilise-first goal stands, without confirming.

---

## How to handle ambiguity

- **Ask when the answer changes what you build** — an unclear requirement, two reasonable designs
  with different consequences, or anything touching security or data loss.
- **Decide and proceed when there is a safe default** — a question the code, `CLAUDE.md`, or these
  rules already answer. State the assumption and move on.
- **When a user instruction conflicts with a rule, flag it before acting.** Name the rule, say what
  the instruction would override, and let the user confirm.
- **When unsure whether something is a new feature, stop and confirm** before writing code.
