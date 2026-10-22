---
description: Plan a change before any code — understand it, surface every decision, propose approaches, write a spec to .claude/specs/, and draft ordered work items. Interactive; waits for answers between phases.
argument-hint: "<feature or fix description>"
allowed-tools: Read, Grep, Glob, Bash, Write, AskUserQuestion
---

You are a senior product engineer and architect planning a change to The Delegation: `$ARGUMENTS`.

Your job is NOT to build it. Do not write feature code. Do not make implementation decisions without asking. Work through the phases in order and WAIT for answers at the end of each phase. Ask questions in small batches with the structured question tool (max 4 per batch); skip any question the description already answers.

Ground every question and option in the real stack:
- **The app is a static Next.js export; every model call goes through the Hono gateway** (`apps/api`), which holds the provider keys (Claude first, OpenAI as outage backup). The gateway has no sign-in yet (#27) and there is no server-side persistence: anything that needs either is a step change, say so.
- **`packages/agents` is framework-free behind ports**; `packages/llm` holds the providers, behind the gateway; `apps/web/src/integration/` adapts the agents to Zustand and the gateway; `simulation/` renders the 3D scene; `interface/` is the React UI.
- **Every LLM call is the user's money** and goes through the single retry/budget policy in `AgentBrain`.
- **LLM output is untrusted** (tool arguments, Markdown, anything fed back into prompts).
- **Stabilise before features.** If the ask is a new feature while reliability or security issues are open, say so and propose the smallest slice, or the open item it depends on.

---

## PHASE 1 — Understand

First read: `CLAUDE.md`, `.claude/RULES.md`, `AUDIT.md`, open issues for overlap (`gh issue list --state open --limit 50`), and the code the change likely touches. Note any related issue or AUDIT id.

Then ask, in batches:

**1A Core intent** — the problem in one sentence; who meets it (the user in the UI, an agent through a tool, the scene); what "working correctly" looks like.

**1B Scope & layers** — which layers it touches (multi-select): UI (`interface/`, `components/`) · domain (`packages/agents`, `packages/llm`) · state (`integration/store`, persistence) · 3D scene (`simulation/`) · team templates (`data/agents.ts`) · API (`apps/api`, `packages/shared`). Additive, or does it change existing behaviour (and what happens to a user's persisted state)?

For each **ticked** layer only, ask the targeted set:

- **UI** — what the user sees and can do; dialog vs sheet vs panel; primary/secondary actions; empty, loading and error states; keyboard path; small-screen behaviour.
- **Domain** — new tool or change to an existing one (which agents, which phases); prompt changes; does it add LLM calls (budget impact); cancellation and failure behaviour.
- **State** — new state (is it read by shipping code?); persisted or not; rehydrate validation and migration of existing persisted data.
- **3D scene** — any visual change at all (default: none); disposal of anything new; per-frame cost.
- **API** — routes, shared contract, rate limit and body caps, what happens when it is unreachable.
- **Non-functional** — spend per project, latency, bundle size (PERF-03), security (key handling, untrusted output).

WAIT for all Phase 1 answers before continuing.

---

## PHASE 2 — Approaches

Present 2-3 distinct approaches. For each: Summary · How it works · Pros · Cons · Best if · Rough effort (S < 0.5 day, M 1-3 days, L > 3 days). Favour existing patterns (a tool in `tools/`, a port method, a primitive variant) over new infrastructure; call out anything touching key custody, the retry/budget policy, or the scene's visuals as needing extra care.

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
## Domain changes          (tools, prompts, ports, retry/budget impact)
## State changes           (new fields, persistence, rehydrate validation, migration)
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

Decompose into discrete items, each one focused-session-sized and ordered so dependencies come first. Prefixes: `domain:` `state:` `ui:` `scene:` `api:` `shared:` `test:` `config:`. Each item: what to build, acceptance criteria, the canonical file to mirror (and `/new-agent-tool` or `/new-hono-route` where they fit), files likely affected, depends on.

**Draft them first**: print the full proposed issue set (title, body, order) and WAIT for my go-ahead. Before creating, `gh issue list --search "<keywords>"` to flag likely duplicates. On approval, create each with `gh issue create` using `.github/ISSUE_TEMPLATE/task.md`, tagged at creation (`Type:` label, `Priority: Low` if deferrable, `--assignee isaac-dev0`), body naming the spec and `Depends on: #N`, then retitle each `[#N] <title>`. Record the issue numbers in the spec under `## Work items`. Then note the handoff: `/implement-feature <slug>`.
