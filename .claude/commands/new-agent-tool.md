---
description: Scaffold an LLM agent tool from complete-task.ts (defineTool, a z.strictObject args schema, an isOffered gate, ToolResult failures returned to the model) and register it in ToolRegistry.
argument-hint: "<tool_name>  e.g. request_changes"
allowed-tools: Read, Edit, Write, Bash
---

Scaffold agent tool `$ARGUMENTS`, mirroring `packages/agents/src/agent/tools/complete-task.ts`. This adds a capability the model can call, so confirm it isn't a new feature under the stabilise-first goal before writing code.

Read first: `tools/tool-args.ts` (`defineTool`, `requiredText`, `optionalInteger`, `optionalFlag`), `tools/types.ts` (`ToolSpec`, `ToolContext`, `fail`), `tools/complete-task.ts`, `tool-registry.ts`, `prompt-builder.ts`, and `packages/agents/src/orchestration/ports.ts` (the narrow ports behind `ToolContext.project`).

1. Create `packages/agents/src/agent/tools/<camelCaseName>.ts` exporting `const <camelCaseName> = defineTool({ ... })`:
   - `name` is the snake_case `$ARGUMENTS`; `description` is terse and written for the model.
   - `args` is a `z.strictObject` built from the `tool-args.ts` helpers, every string with a length cap. Add `.describe(...)` where the model needs to know what a field means. Never hand-write the JSON Schema: the model-facing schema is derived from `args`, and keywords strict tools reject (length and number bounds) are dropped from it and enforced when the call is parsed. A new kind of field gets a helper in `tool-args.ts` with a test.
   - `isOffered(agent, team, phase)`: offer it only to the agents and phases that may run it (lead-only tools use `isLeadAgent(team, agent.index)`, as `deliver-project.ts` does).
   - `run`: act only through `ToolContext` (`project`, `events`, `setStatus`, `appendHistory`), never a store import. Check ownership and state (is the task assigned to this agent, in the right status) and return `fail("...")` with a message that tells the model how to recover. Never throw.
2. **Register** it: add `register(<camelCaseName>)` to `TOOLS` in `tool-registry.ts`, in the position the model should see it. Update the tool-name list in `test/agent/tool-registry.test.ts`, which also checks every definition passes the gateway contract with strict-safe keywords only.
3. If the tool needs a project operation the ports lack, add the narrowest method to the matching port in `ports.ts` (`TaskBoardPort` for board transitions) and implement it in `integration/orchestration/zustand-deps.ts` and `test/support/fake-project.ts`. No speculative methods.
4. Mention the tool in `prompt-builder.ts` only where the agent needs to know when to use it.
5. Run `/registration-parity`, then `/health-check web`. Verify in the browser that an agent actually calls it and that a bad call returns a useful failure to the model (check the action log).

No inline `//` comments; JSDoc the *why* of any non-obvious guard.
