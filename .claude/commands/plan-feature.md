---
description: Plan a change before any code — understand it, surface every decision, propose approaches, write a spec to .claude/specs/, and draft ordered work items. Interactive; waits for answers between phases.
argument-hint: "<feature or fix description>"
allowed-tools: Read, Grep, Glob, Bash, Write, AskUserQuestion
---

You are a senior product engineer and architect planning a change to the 3D office: `$ARGUMENTS`.

Your job is NOT to build it. Do not write feature code. Do not make implementation decisions without asking. Work through the phases in order and WAIT for answers at the end of each phase. Ask questions in small batches with the structured question tool (max 4 per batch); skip any question the description already answers.

Ground every question and option in the real stack:
- **The app is a static Next.js export of one full-window canvas.** `packages/scene` renders the office and robots and is framework-free (only three, zod and `@the-delegation/office-sim`); `packages/office-sim` decides how robots move (zod only, the movement reference); `apps/web/src/integration/` builds the scene, its cast, the live demo and the clock; `interface/` holds the little React there is (the agent pills, the dev overlay).
- **`apps/api` is a minimal local Hono service** (health only, no sign-in, not called by the web app) and there is no persistence: anything that needs a server, an account or saved state is a step change, say so.
- **The scene's intents are contract-shaped** (`setCast`, `setAgentState`, `setTimeOfDay`, `setViewMode`) and the live demo is a stand-in for a future agent product; reuse them before adding new ones.
- **The models are generated in `packages/office-assets`** (`bun run models`), against `packages/scene/assets/asset-contract.json`. A change to a model, a POI, a clip or an agent state is a generator or layout change there, checked against the contract; say so. Robot changes need the local source rig.
- **The scene's visuals don't change** unless the plan says exactly how, and every new GPU resource is disposed.
- **Stabilise before features.** If the ask is a new feature while reliability or security issues are open, say so and propose the smallest slice, or the open item it depends on.

---

## PHASE 1 — Understand

First read: `CLAUDE.md`, `.claude/RULES.md`, `AUDIT.md`, open issues for overlap (`gh issue list --state open --limit 50`), and the code the change likely touches. Note any related issue or AUDIT id.

Then ask, in batches:

**1A Core intent** — the problem in one sentence; who meets it (someone watching the office, someone reading the page, a caller of the API); what "working correctly" looks like.

**1B Scope & layers** — which layers it touches (multi-select): UI (`interface/`, `components/`, `app-shell.tsx`) · 3D scene (`packages/scene`) · movement (`packages/office-sim`) · cast and wiring (`data/`, `integration/`) · assets (`packages/office-assets`, `bun run models`) · API (`apps/api`, `packages/shared`). Additive, or does it change existing behaviour?

For each **ticked** layer only, ask the targeted set:

- **UI** — what the user sees and can do; dialog vs sheet vs panel; primary/secondary actions; empty, loading and error states; keyboard path; small-screen behaviour.
- **Cast and wiring** — which slots are in the office; which scene intents the host sends and when; any new state (is it read by shipping code?), and where it lives (the only store is the small external one in `integration/office-agents.ts`).
- **Movement** — does it change how robots walk, reserve POIs or play clips? Does office-sim already do it, and does the change belong there (movement) rather than in the scene?
- **Assets** — new or changed models, POI nodes (`poi-<kind>-<id>`), clips, agent states or scene extras, whether the asset contract's version changes (a new major is refused until the code follows), and the effect on download size.
- **3D scene** — any visual change at all (default: none); WebGPU and WebGL2 behaviour; disposal of anything new; per-frame cost.
- **API** — routes, shared contract, body caps, CORS (none today), what happens when it is unreachable.
- **Non-functional** — frame time on weak GPUs, load time and bundle size (PERF-03), security (CSP, exposure of the API).

WAIT for all Phase 1 answers before continuing.

---

## PHASE 2 — Approaches

Present 2-3 distinct approaches. For each: Summary · How it works · Pros · Cons · Best if · Rough effort (S < 0.5 day, M 1-3 days, L > 3 days). Favour existing patterns (an existing scene intent, an office-sim behaviour from the reference, a contract POI kind, a primitive variant) over new infrastructure; call out anything touching the scene's visuals, the `packages/scene` boundary or the API's exposure as needing extra care.

End with: "Which approach would you like, or should I propose a hybrid?" WAIT for the answer.

---

## PHASE 3 — Spec

Write the spec to `.claude/specs/<slug>.md` (absolute dates; no em-dashes in any copy that will ship). Skeleton:

```markdown
# <name>
> Spec written: <date>
> Status: Planned, not yet implemented
> AUDIT ids: <ids or none>

## Problem
## Success criteria
## Out of scope
## Layers touched
## User journey            (happy path, then key edge cases)
## Cast and wiring changes (cast, intents sent, any new state)
## Asset changes          (models, contract, POIs, clips, size)
## UI / UX notes           (dialogs, empty/loading/error states, keyboard, copy)
## Scene changes           (none, or exactly what and how it is disposed)
## API changes             (routes, shared contract)
## Approach chosen + why
## Open questions
## Security considerations (key handling, untrusted LLM output, CSP)
## Non-functional          (spend, latency, bundle size)
```

Show me the spec and WAIT for sign-off. A spec lives only until the work ships: `/implement-feature` files any open item as an issue and then deletes it, leaving git history as the record.

---

## PHASE 4 — Work items

Decompose into discrete items, each one focused-session-sized and ordered so dependencies come first. Prefixes: `scene:` `office-sim:` `assets:` `web:` `ui:` `api:` `shared:` `test:` `config:`. Each item: what to build, acceptance criteria, the canonical file to mirror (and `/new-hono-route` where it fits), files likely affected, depends on.

**Draft them first**: print the full proposed issue set (title, body, order) and WAIT for my go-ahead. Before creating, `gh issue list --search "<keywords>"` to flag likely duplicates. On approval, create each with `gh issue create` using `.github/ISSUE_TEMPLATE/task.md`, tagged at creation (`Type:` label, `Priority: Low` if deferrable, `--assignee isaac-dev0`), body naming the spec and `Depends on: #N`, then retitle each `[#N] <title>`. Record the issue numbers in the spec under `## Work items`. Then note the handoff: `/implement-feature <slug>`.
