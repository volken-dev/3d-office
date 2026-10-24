# Model viewer
> Spec written: 2026-10-23
> Status: Planned, not yet implemented
> AUDIT ids: none. Issue #62.

## Problem

Model and rendering work (#41, #51 to #54, #58) has to be done inside the full app: a brief, a
team, agents walking around. There's no bench for loading a model, playing one clip, comparing
WebGPU with WebGL2, or tuning light, shadows and anti-aliasing with frame stats beside it. And
the scene's render settings are hard-coded in `Stage` and `Engine`, so a tuned value can only be
kept by editing code.

## Success criteria

- `apps/viewer` starts on its own (`bun run dev` in `apps/viewer`, or `bun run dev:viewer` from the
  root) on `127.0.0.1:5174`. It renders through `@the-delegation/scene` and never calls the gateway.
- It shows the office with a demo cast, and lets you drive characters with the same intents the
  app uses: to a desk, to the boardroom, back to spawn, chat, project delivered.
- A character inspector lists the character's clips and plays any state (one-shot or loop), with
  pause and slow motion, through the real state machine, so #58 reproduces in the viewer.
- WebGPU and WebGL2 can be switched (the scene rebuilds).
- A dropped `.glb` is checked against the GLB contract and the report is shown. A character GLB
  that passes is drawn as a cast member. A dropped office replaces the office.
- Render settings (ambient and sun light, sun position, shadows, anti-aliasing, pixel-ratio cap,
  adaptive resolution, background) are live-editable and exportable as
  `packages/scene/src/render-settings.json`, which the scene reads as its defaults.
- The web app's office looks the same as before: the committed `render-settings.json` holds
  today's values.

## Out of scope

- Editing geometry, rigs or materials. That stays in Blender.
- Writing files from the viewer. Export is a download or clipboard copy; the developer commits it.
- Baked lighting, contact shadows and a new anti-aliasing technique (#51 to #53). The viewer is
  where they'll be tried, but each is its own issue.
- Any change to the web app beyond passing nothing new (it uses the defaults).

## Layers touched

- `packages/scene`: render settings, a preview API for the viewer, a backend switch, model
  overrides, and the GLB contract check moved from tests into `src`.
- `apps/viewer`: new, Vite + Tweakpane (dependencies approved by Isaac on 2026-10-23).
- Repo config: workspace, turbo `dev`/`build`/`typecheck`/`lint`, CI builds the viewer, `bun.lock`.
- Not touched: `packages/agents`, `packages/llm`, `apps/api`, the stores, `apps/web/src/interface`.

## Domain changes

None.

## Scene changes

- **Render settings.** `RenderSettingsSchema` (zod) in `render-settings.ts`, with defaults parsed
  from `render-settings.json` holding exactly today's values: ambient 1π, sun 0.5π at (10, 20, 10),
  shadow map 1024, radius 2, bias -0.0001, camera ±10, antialias on, pixel ratio 1 to 2, adaptive
  resolution on, background `#fafcfb`.
  - `SceneOptions.renderSettings?` overrides the defaults at construction.
  - `SceneManager.applyRenderSettings(settings)` applies everything live except antialias. That
    one needs a new renderer, so it's reported as `needsRebuild`.
- **Backend.** `SceneOptions.forceWebGL?` is passed to `WebGPURenderer({ forceWebGL })`.
- **Preview API (used by the viewer only).**
  - `playCharacterState(agentIndex, state)` goes through the controller's state machine.
  - `clipsFor(agentIndex)` returns names and durations from the rig.
  - `setTimeScale(scale)`, where 0 pauses.
- **Model overrides.** `SceneOptions.modelUrls?: ReadonlyMap<path, url>`. The loader uses an
  override (a dropped file's blob URL) before `assetBaseUrl`.
  - `registerCharacterModel(def)` adds a character model at runtime. `CHARACTER_MODELS` stays the
    built-in list.
- **GLB contract.** The checks in `test/characters/character-models.test.ts` and
  `test/world/poi-manager.test.ts` move into `src/glb-contract.ts`
  (`checkCharacterGlb(json)`, `checkOfficeGlb(gltf)`), returning a report. The tests call them on
  the committed assets, and the viewer calls them on dropped files.
- Everything new is disposed with the scene. No per-frame cost, beyond multiplying the delta by
  the time scale.

## UI / UX notes (viewer)

- One page: the canvas fills the window, with a Tweakpane panel on the right. Folders:
  - **Scene:** backend, reload.
  - **Cast:** size, each member's model.
  - **Actions:** per agent: desk, boardroom, spawn, chat with the user, project delivered.
  - **Inspector:** the selected character, its clips, play as one-shot or loop, pause, speed.
  - **Render:** every render setting, with Export JSON and Copy JSON.
  - **Stats:** frame time graph, GPU time, draw calls, triangles.
- Drop zone: the whole window. Dropping a `.glb` shows the contract report in a Tweakpane folder.
  Errors are listed by node or clip name.
- Loading and errors: a text status in the panel. A WebGPU failure says so and offers WebGL2.
- It's a dev tool with no shipped user-facing copy, but the copy rules still apply to its strings.

## API changes

None. The viewer never talks to the gateway.

## Approach chosen + why

Build on `@the-delegation/scene`, so the viewer renders exactly what the product renders. Use
Vite and Tweakpane (approved), because Tweakpane gives typed controls without hand-rolled inputs
and without bringing React and shadcn into a dev tool. Render settings become data (JSON plus a
zod schema) so a tuned value is kept by committing one file, not by editing code.

## Open questions

- None blocking. If a setting can't change live on WebGL2, the viewer rebuilds the scene for it.

## Security considerations

- Dropped files are read locally as blob URLs and never uploaded.
- The GLB JSON is parsed and checked, and invalid input produces a report, not a crash.
- The dev server binds to `127.0.0.1`, as the web app's does.

## Non-functional

- No impact on spend.
- No change to the web app bundle: the defaults JSON is about 300 bytes and replaces the
  hard-coded constants.
- The viewer is never built into the static export.

## Work items

All on one branch and one PR, which also closes #62.

1. #72 feat(scene): render settings as data with today's values as defaults
2. #73 feat(scene): backend switch, character preview and time scale for the viewer (depends on #72)
3. #74 feat(scene): model overrides, runtime character registration and the GLB contract in src (depends on #73)
4. #75 feat(viewer): scaffold apps/viewer on Vite with the office and a demo cast (depends on #74)
5. #76 feat(viewer): scene, cast, actions and stats panels (depends on #75)
6. #77 feat(viewer): character inspector (depends on #76)
7. #78 feat(viewer): drag and drop GLBs with a contract report (depends on #77)
8. #79 feat(viewer): render settings panel and export (depends on #78)
9. #80 docs: document the model viewer (depends on #79)
