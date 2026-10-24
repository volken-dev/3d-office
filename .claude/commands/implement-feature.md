---
description: Implement a planned change by working its spec's items in dependency order — one at a time, verifying and committing each on one branch, then opening one PR that closes them all. Stops and asks before any decision the spec doesn't cover.
argument-hint: "<spec-slug>"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
---

You are implementing a planned change: `$ARGUMENTS`. Planning is done: a signed-off spec exists at `.claude/specs/$ARGUMENTS.md`, and its `## Work items` lists the open issues. Work the items in dependency order, one at a time, verifying and committing each, then open a single PR.

Never drift from these:
- `packages/scene` stays framework-free: it imports only itself, its assets, three, zod and `@the-delegation/office-sim`, and never a store, React or app code. `packages/office-sim` imports only zod.
- The models and `asset-contract.json` are synced from agent-office (`bun run assets`); never hand-edit them.
- The 3D scene's visuals don't change unless the spec says exactly how.
- No `any`, no forcing `as` casts, no inline `//` comments, full descriptive names (RULES.md).

Do not skip ahead, implement more than one item at a time, or make a decision the spec doesn't cover without asking.

---

## STARTUP

1. Read `.claude/specs/$ARGUMENTS.md` in full. If it's missing, STOP: "I can't find a spec for this. Run `/plan-feature` first."
2. Read `CLAUDE.md`, `.claude/RULES.md`, and the AUDIT ids the spec names.
3. Fetch the issues (`gh issue view N` for each in `## Work items`) and build the order from each issue's `Depends on:` (typical layer order: shared -> api -> office-sim -> assets -> scene -> integration -> ui -> test -> config).
4. **Create the branch once** from an up-to-date `main`: `git switch -c <feat|fix|refactor>/$ARGUMENTS`. Never commit on `main`.
5. Present the sequence and WAIT for confirmation.

---

## FOR EACH ITEM

### Step 1 — Read & orient
Read every file the item lists, the matching spec section, the relevant RULES.md section, and the **canonical sibling** to mirror: robot movement -> `packages/office-sim/src/agent.ts` (and agent-office's `viewer/agent-sim.js`); office rendering -> `packages/scene/src/office/status-lights.ts`; robot rendering -> `packages/scene/src/robots/three-actor.ts`; a scene intent -> `packages/scene/src/scene-intent.ts` + `SceneManager.apply`; host wiring -> `apps/web/src/integration/office-scene.ts`; an app-side scheduler -> `apps/web/src/integration/time-of-day.ts` or `live-demo.ts`; a route -> `apps/api/src/routes/health.ts` (via `/new-hono-route`); a shared contract -> `packages/shared/src/api.ts`.

### Step 2 — Surface ambiguities first
List every decision this item needs that the spec, CLAUDE.md and RULES.md do NOT answer. Ask with `AskUserQuestion` (max 4 at once): the decision, the options, each option's implication, your lean and why. WAIT. If there are none, say so and proceed.

### Step 3 — Implement
Mirror the canonical file. Use `/new-hono-route` where it fits. Remove slop in files you touch (dead code, commented-out code, explanatory `//` comments, `any`).

### Step 4 — Verify
Run `/health-check` for the touched packages; fix failures before committing. Then exercise the item for real: the app via `bun run dev` for UI and scene items (StrictMode on, check the console and the backquote render stats), `curl` for an API item. Note what you ran and saw; it goes in the PR's **Verified** section.

### Step 5 — Commit
Show `git status`, stage intentionally, Conventional Commits (optional scope `web`/`api`/`scene`/`office-sim`/`shared`/`repo`), body `Implements #N. Spec: .claude/specs/$ARGUMENTS.md`, ending with the `Co-Authored-By:` trailer Claude Code supplies for the current model. Don't close the issue here; the PR closes it.

### Step 6 — Check in
Print: "<item> committed. Next: <item> (<one line>). Continue, or review the diff first?" WAIT.

---

## AMBIGUITY MID-IMPLEMENTATION
If you hit a decision the spec doesn't cover: STOP, don't guess. State the decision, options, implications and your lean. Record the answer in the commit body (not an inline `//` comment) and in the spec's `Open questions`.

---

## COMPLETION

1. `/health-check` across all touched packages — everything green.
2. Retire the spec: list anything still open (open questions, deferred follow-ups); with my go-ahead file each as a tagged issue. Then delete the spec and repoint anything that referenced it. Git history keeps it.
3. Flip the Status of any `AUDIT.md` item this closes.
4. Open ONE PR (mirror `/ship`): push the branch, `gh pr create` targeting `main` with `Closes #N` for **every** issue, the summary, the deleted spec and follow-up issues, and the **Verified** section. Tag it like the issues.

Don't push to `main` and don't merge.
