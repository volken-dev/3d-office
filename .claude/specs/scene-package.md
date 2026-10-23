# Scene package
> Spec written: 2026-10-23
> Status: Implemented on refactor/scene-package (#64 to #68); retired with the PR
> AUDIT ids: none open (follows ARCH-02 and ARCH-04, both fixed). Issue #61; prepares #62.

## Problem

The 3D scene (`apps/web/src/simulation`, 33 files, ~4,400 lines) lives inside the web app. It
still imports the team model (`@the-delegation/agents/team`), the character roster
(`data/agents`), web helpers (`lib/asset`, `integration/frame-stats`,
`integration/screen-positions`), its own command types from `integration/scene-intents`, and
scene-only types from `src/types.ts`. Its models, model sources and asset pipeline also sit in
`apps/web`. So the scene can't be reused by a second app (the model viewer, #62), and the web
app's folder mixes product code with renderer code.

## Success criteria

- `packages/scene` (`@the-delegation/scene`) holds the whole scene: engine, stage, loaders,
  characters, behaviour, drivers, input, pathfinding, world and points of interest.
- The package imports only `three`, `@recast-navigation/*` and `zod`. It doesn't import
  `apps/web`, `@the-delegation/agents`, React or any store. A test enforces this.
- The web app drives it only through the package's public API: the `SceneManager` constructor
  options, `apply(intent)`, `followAgent`, `resetScene` and `dispose`.
- The office looks and behaves the same on WebGPU and WebGL2: characters, models, accessories,
  colours, walking, sitting, chat poses, name bubbles, the lead's delivery celebration, team
  switches and the dev performance overlay.
- `bun run typecheck`, `lint`, `test` and `build` pass. The static export still contains
  `models/*.glb`.

## Out of scope

- The viewer app (#62).
- Which repo owns model optimisation (#62).
- Stable agent ids (#12): the scene keeps addressing characters by index.
- Any visual, behaviour or performance change, including #51 to #55, #57 and #58.
- Renaming the scene's classes.

## Layers touched

- 3D scene: moves to `packages/scene`.
- `apps/web/src/integration`: builds the cast and adapts intents. Owns the React context.
- Repo config: a new workspace package, dependencies moved out of `apps/web` (`bun.lock`
  changes, approved), and a step that copies the assets into `apps/web/public`.
- Docs: `CLAUDE.md` tree, `.claude/RULES.md` P3 and rule 10 (approved).
- Not touched: `interface/` (only import paths), `packages/agents`, `packages/llm`,
  `apps/api`, the stores and persisted state.

## User journey

No user-facing change. The app loads the office, the characters spawn, chat walks and poses
work, switching teams rebuilds the cast, and design mode pauses rendering, all as today.

Edge cases that must keep working:
- A team whose agent names a missing model falls back to the default model.
- Removing a non-last agent rebuilds without crashing (#43).
- A lost GPU device rebuilds the scene (app shell, up to 3 times a minute).
- StrictMode's double mount leaves one canvas.

## Domain changes

None. The scene's input becomes a **cast** instead of an `AgenticSystem`:

```ts
/** Who the scene draws, in roster order (user first, then lead first), and the office accent. */
interface SceneCast {
  themeColor: string
  members: readonly CastMember[]
}
interface CastMember {
  index: number
  /** Behaviour only: the user is player-driven, the lead never sits and celebrates on delivery. */
  role: "user" | "lead" | "member"
  modelId: string
  accessory: AccessoryId | null
  color: string
}
```

- The look rule (an agent's own registered `character`, else robot for the lead and default
  for the rest, plus headphones for leads and caps for members) moves from
  `simulation/characters/character-appearance.ts` to `apps/web/src/integration/scene-cast.ts`
  (`castForTeam(team)`). That's the only place `AgenticSystem` becomes a cast.
- `MAX_AGENTS` (used to spread NPC wander angles) is replaced by a scene constant with the same
  value, 5. A web test asserts the two are equal, so the visuals don't change.
- `SceneIntent` and `AgentWork` move into the package. `replaceTeam` and `updateTeam` carry
  a `SceneCast`. Deriving intents from store changes (`scene-intents.ts`) stays in web.
- No change to the retry or budget policy, the tools, the prompts or LLM calls.

## State changes

None. No new store fields, nothing persisted, no migration.

## UI / UX notes

None. `scene-context.ts` moves to `apps/web/src/integration/scene-context.ts`, and the
`useScene` import paths in 6 interface files change.

## Scene changes

No visual change. What moves or changes shape:
- `simulation/**`, except `scene-context.ts`, goes to `packages/scene/src/**`, keeping the
  folder layout. Renames are separate commits so the diff stays readable.
- `apps/web/src/types.ts` (only the scene uses it) goes to `packages/scene/src/scene-types.ts`.
- The asset URL: `SceneManager` takes `assetBaseUrl` (web passes `/`; the viewer passes its
  own). `constants.ts` and `character-models.ts` build their URLs from it rather than from
  `lib/asset`.
- Frame stats: `SceneEvents.onFrameStats?(stats)` replaces the direct `publishFrameStats`
  import. The `FrameStats` type moves into the package. `integration/frame-stats.ts` keeps the
  React hook and the store of the latest stats.
- Screen positions: the scene takes a `ScreenPositionSink` (`set(index, x, y)`, `clear()`,
  `notify()`) in its options instead of importing `integration/screen-positions`. Web passes
  the existing module's functions. The per-frame writes stay allocation-free, the same calls in
  the same order.
- Nothing new is created, so nothing new needs disposing.

Assets:
- `apps/web/public/models/*` goes to `packages/scene/assets/models/*`, the README with its
  licence included.
- `apps/web/assets-src/models/*` goes to `packages/scene/assets-src/models/*`.
- `apps/web/scripts/optimize-models.ts`, `add-poi-extras.ts` and `draco3dgltf.d.ts` go to
  `packages/scene/scripts/`. `bun run assets` moves to the package, and the gltf-transform,
  meshoptimizer and draco3dgltf dev dependencies move with it.
- `apps/web/scripts/copy-scene-assets.ts` copies `packages/scene/assets/models` into
  `apps/web/public/models` from `predev` and `prebuild`. `apps/web/public/models` is
  gitignored.
- The GLB contract tests (#47) move with the package and read the package's assets.

Package setup, mirroring `packages/agents`:
- `package.json` with `"exports": { "./*": "./src/*.ts" }` (no barrels), and `typecheck`,
  `lint`, `test` and `format` scripts.
- `tsconfig.json` with the DOM lib and `strict`, plus `test/tsconfig.json`.
- Tests go in `packages/scene/test/**`, mirroring `src/`. The 8 files in
  `apps/web/test/simulation` move there, plus a new boundary test that fails on any import
  outside the allowed list.

## API changes

None.

## Approach chosen + why

Approach A, one PR (chosen by Isaac on 2026-10-23), with ordered commits so it stays
reviewable:
1. Cut the ties in place: the cast, the injected URL and callbacks, and the types moved under
   `simulation/`.
2. Pure `git mv` of the scene and its tests into `packages/scene`, plus the package config and
   dependency move.
3. Move the assets and the pipeline, add the copy step, update the docs.

The browser is checked after commits 1 and 3 on WebGPU and WebGL2.

## Open questions

- Resolved during #64: `SceneCast` has no `id`. Nothing would read it, because `teamIntents`
  already decides between rebuilding and updating, and CLAUDE.md forbids unread fields. The
  manager's and controller's `setTeam` methods became `setCast`, because they take a cast; the
  intents keep the names `replaceTeam` and `updateTeam`.
- Resolved during #66:
  - The development-only switch for frame stats moved to the host. `Engine` measures (and
    requests GPU timestamps) only when it's given `onFrameStats`, and the web app passes it only
    when `process.env.NODE_ENV === "development"`. That way the package needs no Node typings.
    The cost is about 3 KB raw (0.5 KB gzipped) of profiler class in the production bundle,
    which never runs.
  - The office contract test (`poi-manager.test.ts`) checks spawn points and desks for agent
    indices 1 to 5. A web test checks that the team templates stay within 1 to `MAX_AGENTS`.
  - `character-manager.ts` imports `tsl-typing-gaps.ts`, so the TSL augmentation applies
    wherever the scene is typechecked from, not only inside the package.

- The `predev` copy runs once per `bun run dev`. Re-running `bun run assets` during a dev
  session needs a restart (or a re-copy) to show the new models. Accepted for now. The viewer
  (#62) is where models get iterated.

## Security considerations

None new. No key handling, no LLM output, no new network access. The CSP `img-src` and
`connect-src` rules are unaffected because the models are still served same-origin from
`/models`.

## Non-functional

- Spend: none.
- Bundle: the same code, so the same size. Check the main chunk size before and after.
- Build: adds a file copy of under 1 MB to `predev` and `prebuild`.

## Work items

All on one branch and one PR, which also closes #61.

1. #64 refactor(scene): draw a cast instead of a team
2. #65 refactor(scene): inject the scene's web dependencies and own its types (depends on #64)
3. #66 refactor(scene): move the scene into packages/scene (depends on #65)
4. #67 chore(scene): move the models and asset pipeline into packages/scene (depends on #66)
5. #68 docs: document packages/scene in CLAUDE.md and RULES.md (depends on #67)

## Follow-ups

- #69 remove the unused `biome-ignore` in `action-log-debug-entry.tsx` (already on main)
- #70 point `.claude/commands/plan-feature.md` and `test-gaps.md` at `packages/scene` (needs Isaac's OK)
- Accepted, not filed: re-running `bun run assets` during dev needs a dev restart to pick up the copy.
