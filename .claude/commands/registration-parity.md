---
description: Check every API route group is mounted with its contract in @the-delegation/shared, and every character model is registered and built. Read-only; lists gaps.
allowed-tools: Read, Grep, Bash
---

Audit registration parity and report any gaps as a checklist. Modify nothing.

1. **API routes** — every route group exported from `apps/api/src/routes/*.ts` must be mounted with `.route(...)` in `apps/api/src/app.ts`. List any exported-but-not-mounted.
2. **Contracts** — every API route that validates input or returns JSON uses a schema from `@the-delegation/shared`; no route hand-builds an error body instead of going through `errors.ts`.
3. **Character models** — every entry in `CHARACTER_MODELS` (`packages/scene/src/characters/character-models.ts`) has its source GLB in `packages/scene/assets-src/models/` and its optimised copy in `packages/scene/assets/models/`, and every `modelId` in `apps/web/src/data/office-cast.ts` names a registered model.

Output a short table per area; if everything's wired, say so in one line.
