---
description: Implement a planned change by working its spec's items in dependency order — one at a time, verifying and committing each on one branch, then opening one PR that closes them all. Stops and asks before any decision the spec doesn't cover.
argument-hint: "<spec-slug>"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
---

You are implementing a planned change: `$ARGUMENTS`. Planning is done: a signed-off spec exists at `.claude/specs/$ARGUMENTS.md`, and its `## Work items` lists the open issues. Work the items in dependency order, one at a time, verifying and committing each, then open a single PR.

Never drift from these:
- `core/` is framework-free and talks through ports; never import a store, React or the scene from it.
- Every LLM call goes through the `AgentBrain` retry/budget policy; no new loops or retries.
- LLM output is untrusted: tool args validated in `parseArgs`, Markdown through `components/Markdown.tsx`.
- The 3D scene's visuals don't change unless the spec says exactly how.
- No `any`, no forcing `as` casts, no inline `//` comments, full descriptive names (RULES.md).

Do not skip ahead, implement more than one item at a time, or make a decision the spec doesn't cover without asking.

---

## STARTUP

1. Read `.claude/specs/$ARGUMENTS.md` in full. If it's missing, STOP: "I can't find a spec for this. Run `/plan-feature` first."
2. Read `CLAUDE.md`, `.claude/RULES.md`, and the AUDIT ids the spec names.
3. Fetch the issues (`gh issue view N` for each in `## Work items`) and build the order from each issue's `Depends on:` (typical layer order: shared -> domain -> state -> api -> ui -> scene -> test -> config).
4. **Create the branch once** from an up-to-date `main`: `git switch -c <feat|fix|refactor>/$ARGUMENTS`. Never commit on `main`.
5. Present the sequence and WAIT for confirmation.

---

## FOR EACH ITEM

### Step 1 — Read & orient
Read every file the item lists, the matching spec section, the relevant RULES.md section, and the **canonical sibling** to mirror: a tool -> `core/agent/tools/completeTask.ts`; a provider -> `core/llm/providers/GeminiProvider.ts`; a port method -> `core/orchestration/ports.ts` + `integration/orchestration/zustandDeps.ts`; a store slice -> `integration/store/coreStore.ts`; a dialog -> `interface/DeleteTaskModal.tsx`; a route -> `apps/api/src/routes/llm.ts`.

### Step 2 — Surface ambiguities first
List every decision this item needs that the spec, CLAUDE.md and RULES.md do NOT answer. Ask with `AskUserQuestion` (max 4 at once): the decision, the options, each option's implication, your lean and why. WAIT. If there are none, say so and proceed.

### Step 3 — Implement
Mirror the canonical file. Use `/new-agent-tool` or `/new-hono-route` where they fit. Remove slop in files you touch (dead code, commented-out code, explanatory `//` comments, `any`).

### Step 4 — Verify
Run `/health-check` for the touched packages; fix failures before committing. Then exercise the item for real: the app via `bun run dev` for UI, domain and scene items (StrictMode on, check the action log and console), `curl` for an API item. Note what you ran and saw; it goes in the PR's **Verified** section.

### Step 5 — Commit
Show `git status`, stage intentionally, Conventional Commits (optional scope `web`/`api`/`shared`/`repo`), body `Implements #N. Spec: .claude/specs/$ARGUMENTS.md`, ending with the `Co-Authored-By:` trailer Claude Code supplies for the current model. Don't close the issue here; the PR closes it.

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
