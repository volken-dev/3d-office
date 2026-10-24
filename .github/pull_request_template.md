## What changed and why

<!-- One or two sentences. Link the issue. -->
Closes #

## Verified

<!-- What you ran to see this work and what you saw: the app via `bun run dev` (StrictMode on), or an HTTP call to the API. Typecheck and lint alone don't count. Name anything you could not exercise locally, and why. -->

## Packages affected

- [ ] Web (`apps/web`)
- [ ] API (`apps/api`)
- [ ] Scene (`packages/scene`)
- [ ] Shared (`packages/shared`)
- [ ] Repo / `.claude` only

## Checklist

- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all pass (`/health-check`)
- [ ] Exercised for real and written up under **Verified**
- [ ] New artifact registered (route in `app.ts`, character model in `character-models.ts`)
- [ ] No `any`, no forcing casts, no explanatory `//` comments, full descriptive names
- [ ] UI composes `components/ui/*` primitives and theme tokens; no dashes, emoji or exclamation marks in copy
- [ ] The 3D scene looks the same, unless this PR says how and why it changed
- [ ] `AUDIT.md` updated if this closes an AUDIT item

## Notes / screenshots
