# RULES.md — The Delegation

> These rules are non-negotiable. Follow them in every session without exception.
> If a user instruction conflicts with a rule, **flag the conflict before proceeding** — do
> not silently comply, and do not silently refuse.
>
> Read `CLAUDE.md` first every session, open GitHub issues for what is still to do, and `AUDIT.md`
> for the baseline audit and what has been fixed.
> `CLAUDE.md` describes *what the system is*; this file is *what you must and must not do*.
> Adapted from Volken's RULES.md on 2026-10-22; see `.claude/notes/volken-import.md` for what was
> left out and why.

---

## Core principles

These five govern everything below. When a specific rule is missing, decide by these.

- **P1 — Validate at every boundary; fail loud on bad input.** Persisted storage on rehydrate,
  LLM tool arguments, API route input, env. A malformed boundary is a hard, visible failure (or a
  safe fallback that says so), never a silent filter.
- **P2 — LLM output is untrusted input.** Tool-call arguments are parsed and authorised per agent
  and phase; rendered output goes through `components/Markdown.tsx`; board state passed into
  prompts is tagged and truncated as data, never spliced in as instructions.
- **P3 — Keep the layers apart.** `core/` is framework-free and talks to the world through ports;
  `integration/` adapts it to Zustand and React; `simulation/` renders. The UI never reaches into
  `core/` internals, and `core/` never imports a store.
- **P4 — Spend is the user's money.** Every path that can call the LLM goes through the single
  retry/budget policy in `AgentBrain`. Nothing loops, retries, or re-sparks an agent outside it.
- **P5 — Fix what you find; leave nothing broken silently.** If you discover a bug during any
  task — even one you did not cause — fix it when it is safe and in reach, or file a `Type: Bug` /
  `Type: Tech Debt` issue when it is risky or large. Never walk past a known defect and say nothing.

---

## 1. File, structure, and naming

1. **One responsibility per file.** One tool per file in `core/agent/tools/`, one provider per
   file in `core/llm/providers/`, one route group per file in `apps/api/src/routes/`, one panel or
   modal per file in `interface/`.
2. **No barrel files.** Never add an `index.ts` that re-exports a directory. (`packages/shared`
   has one today; prefer subpath exports if it grows, and do not add new barrels.) The single
   permitted barrel-like file is the shadcn `lib/utils.ts` exporting `cn()`.
3. **Never create `utils.ts`, `helpers.ts`, or `misc.ts`.** Name a file for what it does.
4. **Match the surrounding file-naming convention.** `core/`, `simulation/` and `interface/` use
   PascalCase for classes and components (`AgentBrain.ts`, `ChatPanel.tsx`) and camelCase for
   modules (`coreStore.ts`, `proposeTask.ts`); `components/ui/` and `lib/` use kebab-case (shadcn).
5. **Full, descriptive names.** No single-letter or abbreviated identifiers. `agentIndex`, never
   `idx`; `taskId`, never `tId`; `(task) => ...`, never `(t) => ...`. Exceptions: a trivial
   numeric loop counter, and `(a, b)` in a sort comparator.
6. **Use `function` declarations for named and exported functions.** Reserve arrow functions for
   callbacks and inline expressions.
7. **Tests live in a per-package `test/` dir mirroring `src/`** (`src/lib/format.ts` →
   `test/lib/format.test.ts`), never beside the source. (No runner yet, ARCH-09; this is the
   convention when one lands.)

## 2. Code style

8. **Biome does both lint and format** (root `biome.json`, extended per package; ESLint and
   Prettier are banned). Style: **double quotes, no semicolons, trailing commas everywhere, 2-space
   indent, 100-char line width**, imports ordered by Biome's `organizeImports`. Do not hand-tune
   against it. `noExplicitAny`, `noConsole` (warn/error allowed), unused variables and imports are
   errors. `src/components/ui` (shadcn) and `public/` are excluded. Run `bun run lint` and
   `bun run typecheck` before committing; `bun run lint:fix` applies safe fixes.
9. **No inline `//` comments.** The only permitted comments are: JSDoc blocks on functions,
   classes and exports (the *why* / contract), `// TODO(#NN)` linking an open issue (remove or repoint it when that item closes), and tool directives (`// biome-ignore <rule>: <reason>`,
   `// @ts-expect-error`). If a line is not obvious, refactor it — rename, extract, restructure —
   do not annotate it with prose. When you touch a file that has explanatory `//` comments, turn
   the useful ones into JSDoc or better names and delete the rest.
10. **No commented-out code, no narrating comments, no stale comments.** Git keeps history.

## 3. TypeScript

11. **No `any`.** Use `unknown` and narrow. `strict: true` in every package, the 3D scene
    included: TSL nodes get their real generic types from `@types/three`.
12. **No `as` / `as unknown as` casts to force a shape.** Parse with zod and let the type flow
    from the parse. This applies especially to persisted storage, LLM tool arguments and API
    bodies. A narrowing `as` after a runtime check that TS cannot follow is acceptable.
13. **No `var`.** `const` by default, `let` only when reassigned.
14. **Explicit return types where they clarify the contract:** exported functions returning
    scalars, `void`, unions or `null`-unions, and the public API of `@the-delegation/shared`.
    Infer complex returns.
15. **Every exported function gets a JSDoc block** explaining intent and contract — the *why*,
    not the *what*. Add `@param`/`@returns` only when names and types do not already convey it.

## 4. Agents and the LLM

16. **Tools follow the `ToolSpec` shape** (`core/agent/tools/types.ts`): a definition, an
    `isOffered(agent, team, phase)` gate, a `parseArgs` that validates every argument (`readString`
    and friends in `types.ts`, with length caps), and a `run` that returns a `ToolResult`. A failure is returned to the model as `{ ok: false, error }`, never thrown.
17. **A tool is offered only where it may run.** `runToolCall` rejects a tool that wasn't in the
    offered set for that request; keep `isOffered` and authorisation in agreement.
18. **Prompts:** the system part stays static; dynamic state (board, history) is passed as tagged,
    truncated data. Never interpolate user or model text into instructions.
19. **History is append-only, owned by the store, and capped.** No mutable copies in `AgentBrain`.
20. **Every LLM call is cancellable and time-limited** (one `AbortController` per think, combined
    with a timeout). Reset, team switch, task removal and dispose abort in-flight calls.
21. **Errors are classified** (`core/llm/errors.ts`): auth and missing-key errors open the key
    dialog; quota pauses the run; everything else is a toast or a task error. Never open the key
    dialog for a transient failure.
22. **Agent identity:** do not add new code that assumes positional agent indices or that indices
    start at 1 (ARCH-03, CODE-04).

## 5. State and the scene

23. **Zustand selectors, never whole-store subscriptions** in React (`useShallow` for objects).
    Per-frame data (screen positions) never goes through a store (`integration/screenPositions.ts`).
24. **No side effects inside a `set()` updater**, and no cross-store subscriptions at module load.
25. **Persisted state is validated on rehydrate** and falls back to a safe default.
26. **Everything the scene creates, it disposes**: GPU resources, listeners, timers, subscriptions,
    the canvas, the animation loop. A disposed object never starts new work.
27. **Fire-and-forget async is wrapped** so a rejection is routed to an error state, never left
    unhandled.
28. **Do not change the 3D scene's visuals** as a side effect of other work.

## 6. API (`apps/api`)

29. **Runtime-agnostic.** No Bun, Node or Workers globals in `app.ts` or routes; the entry point
    adapts. Env is read through the typed `AppEnv` bindings.
30. **Validate input with zod against `@the-delegation/shared`** schemas; the typed `hc<AppType>`
    client in `apps/web/src/lib/api-client.ts` is the only way the web app calls it.
31. **Errors go through `errors.ts`** (`handleError`, `errorBody`): one error envelope, a request
    id, upstream errors normalised. Never leak stack traces or raw upstream messages to the client.
32. **Middleware order:** request id → secure headers → CORS (app-wide), then rate limit → body
    limit → validator per route group. A request never reaches `c.req.json()` without paying the
    rate-limit and body-size checks first.
33. **Gate dev-only behaviour on an explicit development check**, never `!== 'production'`.

## 7. Security

34. **Never log or render the user's API key**, and never send it anywhere but the provider it is
    for. The build greps `out/` for keys; keep it that way.
35. **Untrusted Markdown renders through `components/Markdown.tsx` only**: no raw HTML, no remote
    images, http(s)/mailto links only, external links through `ExternalLink`.
36. **Keep the CSP intact** (`scripts/csp.mjs`). A new inline script or remote origin is a CSP
    change and needs a reason.
37. **Don't interpolate sensitive-adjacent strings into `aria-label`s.** Use a generic label.

## 8. UI (`apps/web/src/interface`, `components/`)

38. **Always compose shadcn `components/ui/*` primitives.** Never hand-roll interactive HTML
    (`<button>`, `<input>`, `<select>`, `<textarea>`). Every modal is a `Dialog` / `AlertDialog`.
39. **Fix the primitive, not the call site.** Visual variation is a `cva` `variant`/`size` on the
    primitive; layout classes (margin, width, grid placement) may be passed via `className`. To
    add a look, add a variant. Promote a one-off to a variant the second time it appears.
40. **Tailwind utilities and theme tokens only.** Colours come from `globals.css` tokens
    (`--primary`, `--user`, `--success`, `--destructive`, ...); no raw hex, no new hard-coded
    `zinc-*` (MIG-07). `style={{}}` only for computed or data-driven values (a drag size, a
    screen position).
41. **State coverage is mandatory:** loading = skeletons; empty = helpful text and a primary
    action; destructive = `ConfirmDialog`; async results = toasts (sonner); errors say what
    happened and what to do next.
42. **Keyboard and screen-reader access** for every interactive element; dismissing a dialog never
    destroys data.
43. **Boring or generic UI is a defect, but so is slop.** No accent border-stripes, gimmick
    coloured bars, ALL-CAPS micro-labels, hero metrics, single-point charts, decorative icons, or
    the same fact shown twice. Default to restraint: fewer colours, smaller type, more spacing.

## 9. User-facing copy

44. **No em/en-dashes (`—`, `–`) or bullet glyphs (`•`, `‣`, `·`) in copy strings.** Rewrite with
    commas, full stops or parentheses; real lists use list markup. Internal docs may use them.
45. **No emoji and no exclamation marks** in product UI.
46. **Voice:** second person, active voice, present tense, short sentences. Say what happened,
    then the next step. Never "Something went wrong".
47. **Button labels are verb-first, sentence case** ("Add API key", "Review deliverable");
    pending states are present participles ("Saving...").
48. **Banned words:** seamless, revolutionary, cutting-edge, leverage, empower, unlock,
    supercharge, delightful, world-class, next-generation, synergy.
49. **No internal ids** (`REL-07`, `ARCH-03`) in user-facing copy.

## 10. Git and task workflow

50. **Branches:** `feat/…`, `fix/…`, `refactor/…`, `perf/…`, `chore/…`, `docs/…`.
51. **Commits:** Conventional Commits, imperative, lowercase, no trailing period. Optional scope
    `web`, `api`, `shared` or `repo` (`repo` for root tooling and `.claude/`). One logical change
    per commit.
52. **PRs target `main`** using the PR template: `Closes #N` for each issue closed (`Refs #N` for
    partial work), a **Verified** section (what was run and what was seen), and any `AUDIT.md` ids
    addressed. The PR title is the Conventional Commits summary.
53. **Every task has a GitHub issue; file it yourself** when none exists, without asking first,
    using the templates in `.github/ISSUE_TEMPLATE/`. **Tag at creation:** a `Type:` label (`Bug`,
    `Feature`, `Chore`, `Design`, `Tech Debt`, `Security`, `Infra`, `Performance`), plus
    `Priority: High` / `Priority: Low` where it applies, and the `@isaac-dev0` assignee. Don't
    invent new labels without asking. Title every issue `[#N] <title>` (create it, then
    `gh issue edit N --title` straight away; issues only, not PRs).
54. **One task per session:** complete it, verify it, commit on its branch, open the PR, flip the
    Status of any `AUDIT.md` item it closes, then stop. Don't start the next task until the merge
    is confirmed.
55. **Commit or push only when asked.** If on `main`, branch first.
56. **Never put `fix` / `close` / `resolve` directly before an issue or PR number** you aren't
    closing. Use "Refs #N".

## 11. Tech debt and found bugs

57. **Surface tech debt, deprecations and suboptimal patterns the moment you spot them**, as a
    tagged `Type: Tech Debt` issue with acceptance criteria.
58. **Fix bugs you discover** (P5).
59. **Findings qualified with "after benchmarking", "consider", or "decide" are deferrals, not
    work orders.** File a `Type: Tech Debt` issue; don't make the change.

## 12. Verification

60. **Verify every change by running it, and say how in the PR.** Typecheck and lint passing is
    not verification. Exercise the change the way a person meets it: the app in a browser via
    `bun run dev` (with StrictMode on), or the API over HTTP. Never verify by spending real
    budget in a loop; a single real call with your own key is fine when the change needs it.
61. **Audits are working state.** A mid-stream audit (security, UX, performance) produces
    severity-rated findings with a resolution map, and the doc shrinks as findings close.

---

## What Claude must never do

These are absolute. No exception without an explicit, in-session user instruction.

1. **Never use `any`**, `var`, or an `as` / `as unknown as` cast to force a shape.
2. **Never `console.log` application events**, and never log the user's key or raw prompts.
3. **Never write inline `//` explanatory comments** (JSDoc, linked `TODO(...)` and tool directives
   only).
4. **Never use single-letter or abbreviated names** outside the two exceptions in Rule 5.
5. **Never add a barrel `index.ts`**, and never create `utils.ts` / `helpers.ts` / `misc.ts`.
6. **Never hand-roll interactive HTML** or override a shadcn primitive at the call site.
7. **Never use em-dashes, bullet glyphs, emoji or exclamation marks in user-facing copy.**
8. **Never add a second retry loop or an LLM call outside the `AgentBrain` policy.**
9. **Never trust LLM output** as instructions, as HTML, or as valid tool arguments.
10. **Never import a store, React, or the scene from `core/`.** (One known violation remains:
    `AgentBrain` defaults to the Zustand deps, ARCH-01. Don't add a second.)
11. **Never model speculatively** — no state field, type, port or store slice that shipping code
    doesn't read.
12. **Never add a dependency without confirmation**, and never add a banned one: ESLint, Prettier,
    a date library (use `Intl` / `lib/format.ts`), lodash/underscore, axios (use `fetch` or the
    typed `hc` client).
13. **Never modify without explicit instruction:** `CLAUDE.md`, this file, theme tokens,
    `.env*`, `bun.lock`.
14. **Never run without confirmation:** a push to `main`, a force push, or destructive
    git commands.
15. **Never build new features** while the stabilise-first goal stands, without confirming.

---

## How to handle ambiguity

- **Ask when the answer changes what you build** — an unclear requirement, two reasonable designs
  with different consequences, or anything touching key custody, spend, or data loss.
- **Decide and proceed when there is a safe default** — a question the code, `CLAUDE.md`, or these
  rules already answer. State the assumption and move on.
- **When a user instruction conflicts with a rule, flag it before acting.** Name the rule, say what
  the instruction would override, and let the user confirm.
- **When unsure whether something is a new feature, stop and confirm** before writing code.
