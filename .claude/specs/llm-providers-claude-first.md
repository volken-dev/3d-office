# LLM providers: Claude first, OpenAI backup, Hono gateway
> Spec written: 2026-10-22
> Status: Signed off 2026-10-22, in progress
> AUDIT ids: SEC-01, ARCH-01, ARCH-02, ARCH-07, ARCH-09 (partial), REL items on history and tool calls
> Issues: closes #2 (key in localStorage), #15 (gateway and provider seam), #17 (test runner);
> refs #11 (orchestration move: this spec moves `core/` into `packages/agents`, #11 also covers
> moving orchestration out of `simulation/`); supersedes #6 (key dialog on first load, removed with BYOK)

## Problem

Every LLM call today goes from the browser straight to Gemini with the user's own key (BYOK), and the
agent loop is shaped around Gemini. We want Claude as the first-class provider, the OpenAI API as an
automatic backup during outages, and Gemini removed. Provider keys must leave the browser: the key in
`localStorage` on the shared `github.io` origin is SEC-01 and cannot be fixed while calls are BYOK.

The current loop also breaks Claude's API contract in several places:

1. **Tool results are never sent back.** History stores the model's tool calls but no `tool` result
   (a failure is appended as a `[SYSTEM]` user text, a success adds nothing). Claude requires every
   `tool_use` block to be answered by a `tool_result` with the same id, all parallel results in the
   next user message, or the next request is a 400.
2. **History is a sliding window.** `getHistory(...).slice(-HISTORY_WINDOW)` rewrites the start of the
   conversation every call. That defeats prompt caching and breaks Claude's preserved-thinking rule
   (earlier turns, including thinking blocks, must be replayed unchanged).
3. **The volatile context message comes first.** `buildContextMessage` (brief, board) is prepended
   before the history on every request, so the cacheable prefix ends at the system prompt.
4. **Tool-call ids and Gemini thought signatures** are baked into the stored message shape
   (`LLMToolCall.thought_signature`, OpenAI-style `function.arguments` strings).
5. **Errors and pricing are Gemini-specific** (`missing_key` copy, `/API_KEY_INVALID/` matching,
   `GEMINI_PRICING`, `finishReason === "MALFORMED_FUNCTION_CALL"`).

## Success criteria

- Agents run on Claude by default (`claude-opus-5-5`); each agent's model is chosen from a registry of
  Claude and OpenAI models with prices and capabilities.
- No provider key exists in the browser, the bundle, or `localStorage`. The web app calls only the
  Hono gateway through the typed `hc<AppType>` client.
- A full project (brief, tasks, reviews, delivery) completes on Claude with tool calls answered by
  `tool_result` blocks and an append-only history; prompt cache reads are non-zero from the second
  call of an agent onward (`usage.cache_read_input_tokens`).
- When Anthropic returns 429 / 5xx / overloaded, or the circuit for it is open, the gateway serves the
  request from OpenAI and reports which provider served it. A Claude `refusal` is handled by Anthropic's
  server-side fallback, never by switching to OpenAI.
- Gemini code, the BYOK dialog and key storage are deleted.
- Adapters and the router have unit tests (first tests in the repo, ARCH-09).

## Out of scope

- Server-side orchestration (the agent loop running in `apps/api`) and server-side project persistence.
  This spec makes the agent package framework-free so that move is mechanical later.
- The Codex agent/CLI. "Codex" here means OpenAI API models only.
- Re-adding Gemini (the adapter interface allows it later).
- Any change to the 3D scene's visuals.

## Layers touched

shared (contract), new `packages/llm`, new `packages/agents`, `apps/api` (gateway), `apps/web`
(`core/` moves out, `integration/` wiring, BYOK UI removal, pricing/model UI), docs (`CLAUDE.md`,
`RULES.md`, `README.md`, `AUDIT.md`). Scene: none.

## Domain changes

### Provider-neutral message model (`packages/llm`)

Replace the OpenAI-shaped `LLMMessage` with content blocks:

- `text { text }`
- `tool_call { id, name, input: object }` (input parsed once, never a JSON string)
- `tool_result { toolCallId, content: string, isError }`
- `reasoning { provider, payload }`: provider-opaque (Claude thinking / redacted thinking blocks,
  OpenAI reasoning items). Replayed unchanged to the provider that produced it, dropped when another
  provider serves the request.

Messages are `{ role: "user" | "assistant", content: Block[], metadata }`. The system prompt and tool
definitions travel separately. Usage reports input, output, cache-read and cache-write tokens. Stop
reasons are normalised: `end_turn | tool_use | max_tokens | refusal | pause | other`.

### Adapters

- **Anthropic** (`@anthropic-ai/sdk`, official SDK only): streaming with `.finalMessage()`;
  `thinking: { type: "adaptive" }` with per-agent `output_config.effort` (Opus 5.5 defaults to
  `medium`, set it explicitly); `tool_choice: auto` only (forced `any`/`tool` is a 400 on Opus 5.5)
  with `strict: true` tool schemas and a prompt instruction naming the expected tool; cache
  breakpoints on tools + system and on the last stable message; server-side refusal fallback
  (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); check `stop_reason` before
  reading content; typed SDK errors mapped to `LLMErrorKind`; compaction (beta `compact-2026-01-12`)
  so long histories are summarised server-side instead of trimmed. Exact parameter shapes are taken
  from the SDK docs at implementation time, not from this spec.
- **OpenAI** (official `openai` SDK, Responses API with function calling): maps `tool_call` /
  `tool_result` to function calls with `call_id`; drops Anthropic `reasoning` blocks. Model ids and
  prices are verified against OpenAI's docs at implementation time.

### Router and registry

- Model registry: id, provider, display name, input/output/cache prices, context window, capabilities
  (thinking, effort levels, strict tools). Replaces `core/llm/constants.ts` and `pricing.ts` (Biome-formatted tree, `strict: true`, shared uses subpath exports only).
- Router: per-provider circuit breaker; on 429 / 5xx / overloaded / network from Anthropic, retry once
  on the mapped OpenAI model (a "backup model" field per registry entry), mark the response
  `servedBy`. No fallback on 400, auth or refusal. Fallback is bounded so a request is never sent more
  than twice.

### Agent loop (`packages/agents`, moved from `apps/web/src/core`)

- Every tool call gets a `tool_result` (success summary or `{ error }` with `isError`), all results
  for one assistant turn in a single user message, appended before the next model call. The
  `[SYSTEM] ... failed` text messages go away.
- History is append-only and sent whole. `HISTORY_WINDOW` is deleted; long histories rely on
  compaction (Claude) and a hard per-agent cap that resets the agent's context with a summary when
  exceeded (OpenAI), never a silent slice.
- The system prompt and tool list are byte-stable per agent and phase; the volatile project context
  moves after the history as the latest user turn (or a mid-conversation system message on models
  that support it) so the history prefix caches.
- The single retry/budget policy (P4) stays in `AgentBrain`; the router's one-shot fallback is not a
  retry of the intent and does not count against `MAX_INTENT_ATTEMPTS`, but each provider call counts
  against `LLM_CALL_BUDGET`.
- `LLMErrorKind`: `missing_key`/`auth` become gateway configuration errors (`not_configured`,
  `unauthorized`); copy no longer mentions Gemini or keys the user owns.

## State changes

- `agentHistories` switches to the block format. Existing persisted histories (Gemini-shaped) are
  discarded on rehydrate with a one-time notice, not converted (they carry Gemini signatures that no
  other provider accepts). Validate the new shape with zod on rehydrate (P1).
- `llmConfig` / `llmConfigStorage` (the BYOK key and model) are deleted; the stored key is wiped from
  `localStorage` on first load of the new version.
- Agent `model` fields in persisted custom teams that name Gemini models are remapped to the default
  Claude model by a `teamStore` persist migration.

## UI / UX notes

- Remove the BYOK dialog, "Add API key" alerts and key-related copy. Replace with gateway states:
  unreachable, not configured, rate limited, signed out (if auth lands), each saying what happened and
  what to do next (RULES 41, 46).
- Model picker in the agent config panel lists registry models grouped by provider; pricing modal is
  driven by the registry and shows cache pricing.
- Project panel shows which provider served each call when a fallback happened (debug log + a small
  indicator), so cost and behaviour changes are visible.

## Scene changes

None.

## API changes

- `POST /api/llm/messages` (replaces `/api/llm/completions`): contract in
  `@the-delegation/shared/llm` v2 (block messages, tools, model id from the registry allow-list,
  effort). Response: blocks, normalised stop reason, usage with cache tokens, `servedBy`.
- Optional SSE streaming variant for chat replies (can follow in a later item).
- Bindings: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; `GEMINI_API_KEY` and `apps/api/src/llm/gemini.ts`
  removed.
- Replace the in-memory rate limiter with one that works on the chosen host.
- Auth: GitHub OAuth sign-in (proposed), session cookie, per-user daily spend cap in D1 (see Decisions).

## Approach chosen + why

Gateway per completion now, orchestration in the browser behind ports, packaged so it can move to the
server later. It removes keys from the browser immediately, keeps the agent loop and its single retry
policy where they already work, and makes the eventual server-side orchestration a move of
`packages/agents` rather than a rewrite. Running the whole loop server-side now would also require
server persistence and a streaming event channel to the scene, which is a larger, separate step.

## Decisions (2026-10-22)

- **Host:** Cloudflare Workers. `app.ts` stays runtime-agnostic; a Workers entry and `wrangler` config
  are added; the Bun entry stays for local dev. The in-memory rate limiter is replaced by a Workers
  rate-limiting binding (per IP) plus per-user limits.
- **Gateway access:** users sign in, and each account has a server-enforced daily spend cap. Proposed:
  GitHub OAuth with a session cookie scoped to the API origin, users and spend ledger in Cloudflare D1
  (cost computed from the registry prices and reported usage, checked before each call and recorded
  after). The client's `LLM_CALL_BUDGET` stays as a per-project guard on top.

## Open questions

1. **Sign-in provider.** GitHub OAuth is proposed (fits a developer audience, no passwords stored);
   confirm, or pick another provider.
2. **Daily cap amount** per user, and whether you (the owner) are exempt.
3. **Default models per role.** Decided 2026-10-23: `claude-opus-5-5` for lead agents,
   `claude-sonnet-5-5` for team agents; every agent's model stays editable.
4. **Backup model mapping.** Decided 2026-10-23: `gpt-6.1-sol` backs both Claude models (checked
   against developers.openai.com: Responses API, function calling, effort low to max).
5. **Web host and cookies.** GitHub Pages is gone (2026-10-23) and the web app's host is not chosen.
   Serving the static export from the same Worker as the API (Workers static assets) would make the
   session cookie first-party and remove credentialed CORS; a separate host needs
   `SameSite=None; Secure` cookies. Decide with item 13.

## Security considerations

- Provider keys exist only as gateway secrets; the build's key grep extends to `sk-ant-` and `sk-`
  prefixes.
- The gateway enforces the model allow-list, body and token caps, rate limits and (once decided) auth;
  CORS stays an explicit origin list.
- Tool arguments stay untrusted (P2): `strict: true` schemas plus the existing per-tool `parseArgs`.
- Gateway errors never echo upstream messages or keys (RULES 31, 34).

## Non-functional

- Spend: Claude prompt caching should cut repeat input cost substantially once the prefix is stable;
  fallback calls are reported separately in cost accounting.
- Latency: one extra hop through the gateway; streaming for chat keeps replies responsive.
- Bundle: removes `@google/genai` from the web bundle; the web app ships no provider SDK.

## Work items

Issues: #17 (test runner), #25 (LLM package), #26 (agent loop), #27 (sign-in and spend cap),
#28 (API on Workers); the PR closes #2, #15, #17, #25 to #28 and refs #11; #6 is closed as obsolete.

1. `config:` create `packages/llm` and `packages/agents` workspaces, `bun test` through turbo and CI,
   first tests (#17).
2. `shared:` LLM contract v2: blocks, usage with cache tokens, stop reasons, model allow-list,
   `servedBy` (#25).
3. `domain:` model registry and pricing (#25).
4. `domain:` Anthropic adapter + mapping tests (#25).
5. `domain:` OpenAI adapter + mapping tests (#25).
6. `domain:` router with circuit breaker + tests (#25).
7. `domain:` move `core/agent`, `core/orchestration`, `core/project` into `packages/agents` (#26, refs #11).
8. `domain:` agent loop on the block model: tool results, append-only history, stable prefix,
   provider-neutral errors (#26).
9. `api:` `POST /api/llm/messages` on the router, secrets, delete Gemini (#15).
10. `api:` sign-in and per-user daily spend cap (#27). Dropped on 2026-10-23: the gateway stays a local service, and #27 was closed as not planned.
11. `state:` history and team persist migrations; wipe the stored BYOK key (#26, #2).
12. `ui:` gateway-backed `LLMClient`, remove BYOK UI, gateway error states, registry-driven model
    picker and pricing (#2, #15).
13. `config:` Workers entry, `wrangler`, D1 migrations, rate-limiting binding, secrets; manual
    `wrangler deploy`, no deploy pipeline (#28). Dropped on 2026-10-23 with item 10: the gateway
    stays a local service, and #28 was closed as not planned.
14. `docs:` update `CLAUDE.md`, `RULES.md` (rule 1 provider location, rule 21 error copy, P3 layer
    names), `README.md`, and `AUDIT.md` statuses.
