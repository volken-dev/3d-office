---
description: Scaffold an LLM agent tool from completeTask.ts (ToolSpec, isOffered gate, validated parseArgs, ToolResult failures returned to the model) and register it in ToolRegistry.
argument-hint: "<tool_name>  e.g. request_changes"
allowed-tools: Read, Edit, Write, Bash
---

Scaffold agent tool `$ARGUMENTS`, mirroring `apps/web/src/core/agent/tools/completeTask.ts`. This adds a capability the model can call, so confirm it isn't a new feature under the stabilise-first goal before writing code.

Read first: `tools/types.ts` (`ToolSpec`, `ToolContext`, `fail`, `readString`), `tools/completeTask.ts`, `ToolRegistry.ts`, `PromptBuilder.ts`, and `core/orchestration/ports.ts` (`ProjectStatePort`).

1. Create `apps/web/src/core/agent/tools/<camelCaseName>.ts` exporting `const <camelCaseName>: ToolSpec<Args>`:
   - `definition`: `function.name` is the snake_case `$ARGUMENTS`; a terse description written for the model; a JSON schema with `required` set.
   - `isOffered(agent, team, phase)`: offer it only to the agents and phases that may run it (lead-only tools use `isLeadAgent(team, agent.index)`, as `deliverProject.ts` does).
   - `parseArgs`: validate every argument with `readString` (or a sibling helper added to `types.ts`) with a length cap. Never trust the model's types.
   - `run`: act only through `ToolContext` (`project` port, `setStatus`, `appendHistory`), never a store import. Check ownership and state (is the task assigned to this agent, in the right status) and return `fail("...")` with a message that tells the model how to recover. Never throw. Narrow results with `if (!result.ok)`.
2. **Register** it: add `register(<camelCaseName>)` to `TOOLS` in `ToolRegistry.ts`, in the position the model should see it.
3. If the port lacks an operation, add the narrowest method to `ProjectStatePort` and implement it in `integration/orchestration/zustandDeps.ts`. No speculative methods.
4. Mention the tool in `PromptBuilder.ts` only where the agent needs to know when to use it.
5. Run `/registration-parity`, then `/health-check web`. Verify in the browser that an agent actually calls it and that a bad call returns a useful failure to the model (check the action log).

No inline `//` comments; JSDoc the *why* of any non-obvious guard.
