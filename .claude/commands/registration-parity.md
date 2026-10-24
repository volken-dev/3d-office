---
description: Check every API route group is mounted with its contract in @the-delegation/shared, and the shipped models match the asset contract. Read-only; lists gaps.
allowed-tools: Read, Grep, Bash
---

Audit registration parity and report any gaps as a checklist. Modify nothing.

1. **API routes** — every route group exported from `apps/api/src/routes/*.ts` must be mounted with `.route(...)` in `apps/api/src/app.ts`. List any exported-but-not-mounted.
2. **Contracts** — every API route that validates input or returns JSON uses a schema from `@the-delegation/shared`; no route hand-builds an error body instead of going through `errors.ts`.
3. **Models and the asset contract** — every committed file in `SHIPPED_MODEL_PATHS` (`packages/office-assets/src/model-paths.ts`) exists under `packages/scene/assets/models/`, and nothing else sits there (the web app copies that folder whole); `asset-contract.json`'s `contractVersion` major equals `SUPPORTED_CONTRACT_MAJOR` (`packages/office-sim/src/asset-contract.ts`); every model the scene loads (`OFFICE_MODEL_PATH`, `ROBOT_MODEL_PATH` in `scene-manager.ts`) is listed in the contract's `files`; `packages/scene/test/assets/asset-contract.test.ts` covers each of those files; and every slot in `apps/web/src/data/office-cast.ts` is within 1 to the contract's `agents.max`, and every state in `apps/web/src/data/agent-states.ts` is one of the contract's agent states. Nothing in the models is hand-edited: they come from `packages/office-assets` via `bun run models`, and its `test/contract/check-contract.test.ts` passes.

Output a short table per area; if everything's wired, say so in one line.
