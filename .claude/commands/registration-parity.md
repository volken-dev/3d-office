---
description: Check every agent tool and API route group is registered, and that each API route has its contract in @the-delegation/shared. Read-only; lists gaps.
allowed-tools: Read, Grep, Bash
---

Audit registration parity and report any gaps as a checklist. Modify nothing.

1. **Agent tools** — every `ToolSpec` exported from `packages/agents/src/agent/tools/*.ts` (excluding `types.ts`) must appear as `register(<tool>)` in `TOOLS` in `packages/agents/src/agent/tool-registry.ts`. List defined-but-not-registered, and note any tool whose `isOffered` can never return true for any template in `apps/web/src/data/agents.ts`.
2. **Prompt parity** — every registered tool name that `prompt-builder.ts` refers to exists, and no prompt mentions a tool that is not registered.
3. **API routes** — every route group exported from `apps/api/src/routes/*.ts` must be mounted with `.route(...)` in `apps/api/src/app.ts`. List any exported-but-not-mounted.
4. **Contracts** — every API route that validates a body or returns JSON uses a schema from `@the-delegation/shared`, and the web client (`apps/web/src/lib/api-client.ts`) reaches it only through `hc<AppType>`.

Output a short table per area; if everything's wired, say so in one line.
