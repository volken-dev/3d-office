## What changed and why

<!-- One or two sentences. Link the issue. -->
Closes #

## Verified

<!-- What you ran to see this work and what you saw: the app via `bun run dev` (StrictMode on), or an HTTP call to the API. Typecheck and lint alone don't count. Name anything you could not exercise locally, and why. -->

## Packages affected

- [ ] Web (`apps/web`)
- [ ] API (`apps/api`)
- [ ] Shared (`packages/shared`)
- [ ] Repo / `.claude` only

## Checklist

- [ ] `bun run typecheck`, `bun run lint`, `bun run build` all pass (`/health-check`)
- [ ] Exercised for real and written up under **Verified**
- [ ] New artifact registered (tool in `tool-registry.ts` / route in `app.ts`)
- [ ] No `any`, no forcing casts, no explanatory `//` comments, full descriptive names
- [ ] UI composes `components/ui/*` primitives and theme tokens; no dashes, emoji or exclamation marks in copy
- [ ] LLM calls stay inside the `AgentBrain` retry/budget policy
- [ ] `AUDIT.md` updated if this closes an AUDIT item

## Notes / screenshots
