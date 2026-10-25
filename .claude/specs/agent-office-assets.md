# Agent office assets

> Spec written: 2026-10-24
> Status: Signed off 2026-10-24, in progress
> AUDIT ids: ARCH-04 (the scene becomes a pure view driven by intents), PERF-03 (recast and its
> wasm leave the bundle)

## Problem

The office and its characters are the old Blender office, a human and an early robot, walking a
recast navmesh. Isaac now builds the office and the robot in `~/Projects/agent-office`, from
code, against a versioned asset contract (`dist/asset-contract.json`, contract 5.0.0). Those
assets carry their own walk grid, approach points, agent states, status colours, an ambient clip,
day/night nodes and a reference movement implementation (`viewer/agent-sim.js`). The scene
should render them and move robots the way the reference does, filed so that a future agent
product can drive the robots without touching rendering code.

## Success criteria

- The page shows the agent office (`office.glb`) full window, lit and tone-mapped like the
  agent-office viewer, with its `Ambient` clip looping and no flicker.
- Five robots (`robot.glb`), slots 1 to 5, move exactly as `agent-sim.js` does: walk the grid
  (A* plus string pulling) to a POI's approach point, turn, play the contract's enter clips
  (Sit, Plug_In), loop the state clip, play exit clips when leaving. No two robots hold one POI.
- A live demo gives each robot a new agent state now and then (working, shipping,
  waiting_for_input, idle, paused_or_rate_limited, error, done; robots arrive from the door
  first). Each robot's `primary` material and its pod and bay light show the state's status
  colour.
- Faces animate: the clips' morph-weight tracks play on the `face` mesh. One-shot clips hold
  their last frame (closes #58). Hidden-at-rest props (Zzz, cable, bubbles, hammer) appear only
  in their clips.
- Day and night follow the viewer's local time: night shows `night-only-*` nodes and sky, turns
  on the eight `night-light-*` point lights and raises `lamp_glow`; day does the reverse.
- Overhead camera from +X/+Z: drag pans, right-drag or shift-drag rotates, pinch and notched
  wheel zoom, two-finger trackpad scroll pans (the viewer's controls). Clicking a robot follows
  it; clicking empty floor or pressing Esc returns to the overview.
- A row of agent pills at the top of the screen, one per robot ("Agent 1" to "Agent 5", each
  with a dot in its status colour). Tab moves between pills; focusing or clicking a pill selects
  that robot and the camera zooms in to follow it. Nothing else happens on selection. Esc
  returns to the overview and drops the selection. Clicking a robot in the office selects its
  pill too.
- Works on WebGPU and on the WebGL2 fallback, under StrictMode (one canvas), with GPU device-loss
  recovery as today.
- `packages/scene` no longer depends on recast; robots and the office are the only models.

## Out of scope

- Minibots, tool icons, redrawing the agent board live (it shows its baked sample), the lobby
  queue beyond five robots (the `Roster` is ported, five never queue), `robot-lite.glb` (five
  full robots are cheap enough).
- Local avoidance between robots (a known gap in the contract; POI reservation keeps it rare).
- Running the simulation on the server or in a worker. It is built to allow both later (see
  Approach), but runs on the main thread now.
- Brotli or gzip pre-compression of the GLBs: transport compression is the static host's job and
  there is no host yet.
- The model viewer plan (#62, #72 to #80): see Open questions.

## Layers touched

- **New package `packages/office-sim`** (`@the-delegation/office-sim`): the contract and
  office-data schemas and the movement logic, ported from `agent-sim.js`. No three.js, no DOM:
  zod only. Runs in the browser today, in a worker or on the Hono side later.
- **`packages/scene`**: rewritten internals that render the office and robots and run
  `office-sim` agents through a three.js actor. The engine (renderer, adaptive resolution,
  device-loss handling, frame profiler) and the loader stay.
- **Assets**: `packages/scene/assets/models/office.glb`, `robot.glb` and
  `packages/scene/assets/asset-contract.json`, synced from `agent-office/dist`.
- **`apps/web/src/integration`**: the cast, the live demo, the local clock, click-to-follow and
  Esc.
- **README** (licence and asset docs), `CLAUDE.md` / `RULES.md` where they describe the scene,
  POIs, the boundary test and `bun run assets`.
- API: none.

## User journey

1. The page loads; "Loading office…" shows while the engine starts and `office.glb` (640 KB) and
   `robot.glb` (373 KB) download in parallel and shaders compile.
2. The office appears in day or night lighting by the local clock. Five grey robots walk in from
   the door (`arrive`, yellow), then each heads for its first demo state, turning green, yellow,
   orange or red, with its pod or bay light matching.
3. Every 8 to 20 s (per robot, staggered) a robot gets a new state and walks there, standing up
   or unplugging first. A robot told to change state mid-walk re-targets; one sitting down
   finishes sitting before it leaves (as the reference does).
4. The viewer pans and zooms over the office. Clicking a robot eases the camera onto it and
   follows it; Esc or a click on empty floor eases back to the overview.
5. At 19:00 local time the office switches to night; at 07:00 back to day.

Edge cases: no free POI for a state (the robot stays put and retries every 0.5 s, as the
reference does); WebGPU and WebGL2 both unavailable or a model fails to load (today's "could not
load" alert); GPU device lost (the scene is rebuilt as today, robots start over from the door);
tab hidden for minutes (frame delta is clamped, so robots do not jump).

## Cast and wiring changes

- **Cast**: `SceneCast` becomes the robots' slots only: `{ agentIndices: readonly number[] }`
  (slot N = pod N, bay N, status texel N, 1 to `agents.max`). No user, no model id, no colour,
  no theme colour. `OFFICE_CAST` is `[1, 2, 3, 4, 5]`.
- **Intents** (replacing desk, boardroom, chat, team and resize intents; the contract-shaped set
  a future agent product drives):
  - `{ type: "setCast", cast }`: robots added or removed (rebuilds only what changed).
  - `{ type: "setAgentState", agentIndex, state }`: `state` is a contract agent state name,
    validated against the office's `agentStates`.
  - `{ type: "setTimeOfDay", timeOfDay: "day" | "night" }`.
  - `{ type: "setViewMode", viewMode }`: kept; pauses rendering.
- **Events**: `onAgentClick(agentIndex | null)`, `onDeviceLost`, `onFrameStats` stay;
  `onAgentHover` and `onPoiHover` go (nothing reads them). `followAgent(agentIndex | null)` stays.
- **Live demo** (`apps/web/src/integration/live-demo.ts`): a pure scheduler (seeded random,
  injectable clock) that emits `setAgentState` for each slot: `arrive` first, then a weighted
  pick among the seven other states (working and shipping most often, error rarely, queued
  never). It is app code: a future agent product replaces it with real states and the scene does
  not change.
- **Time of day** (`apps/web/src/integration/time-of-day.ts`): night when the local hour is
  before 7 or from 19; checked on start and every minute; emits `setTimeOfDay` on change.
- **Esc** is handled in `app-shell.tsx` (window keydown, ignored when a dialog handled it) and
  calls `followAgent(null)`.
- No store and no persisted state; nothing new outlives the page.

## Asset changes

- Shipped: `office.glb` (640 KB, ~69k tris, 29 draws), `robot.glb` (373 KB, ~16.5k tris, 7
  draws) and `asset-contract.json` (contract 5.0.0), byte for byte from `agent-office/dist`.
  Deleted: the old `office.glb`, `robot.glb`, `character.glb` and `assets-src/` (the sources
  now live in agent-office).
- `bun run assets` in `packages/scene` becomes a sync: copies those three files from
  `agent-office/dist` (path from the first argument or `AGENT_OFFICE_DIST`, default
  `../../../agent-office/dist`), refuses a contract whose major version differs from the one the
  code supports, and prints what changed. The optimise and add-poi-extras scripts are deleted.
- POIs are read from node names `poi-<kind>-<id>` (yaw from the node rotation), not from
  `poi` extras. `OfficePoiExtrasSchema` and `poi-ids.ts` go.
- Scene extras the code reads are parsed with zod at load (`nav`, `approach`, `agentStates`,
  `statusColors`, `agents`); a mismatch fails the load naming the field.
- Download: 1.01 MB of models vs 0.86 MB today; the recast wasm leaves the bundle.

## UI / UX notes

- `app-shell.tsx` keeps the loading text and the "could not load" alert as they are.
- **Agent pills** (`interface/agent-pills.tsx`), centred over the top of the canvas: a shadcn
  `ToggleGroup` (single, `rovingFocus={false}` so each pill is its own Tab stop) of five pills.
  Each pill: a status dot (`style` background from the state's status colour, data-driven) and
  "Agent N"; the state name is in its accessible label ("Agent 3, working"). Focusing a pill
  selects it (the camera follows that robot); clicking selects it; the pressed pill shows the
  selection. Esc (window keydown, unless something else handled it) clears the selection, returns
  the camera to the overview and blurs the focused pill. Restrained styling: the primitive's
  outline variant, no extra colour beyond the status dot. Hidden until the scene is ready.
- Pill state comes from a small external store in `integration/` (`office-agents.ts`: each
  slot's state and the selected slot, read with `useSyncExternalStore`), written by the live demo
  and by canvas clicks. No Zustand.
- Re-adds the shadcn `toggle-group` and `toggle` primitives, which need `radix-ui` again (removed
  in #81; re-added for this, as Isaac asked for the pills).
- The canvas background follows the time of day (`#dde2e9` by day, `#0a0e1a` at night, from the
  viewer); the page background around it stays `bg-background`.

## Scene changes

The look changes on purpose: it becomes the agent-office viewer's look.

- **Lighting**: hemisphere light (`#ffffff` / `#8791a3`, 1.5) and a directional sun (2.4, from
  (4, 8, 5)) casting PCF shadows over the 21 x 14 m room; `NeutralToneMapping`, exposure 1.0 by
  day and 1.1 at night. The office's baked AO (`COLOR_0`) is used as authored. Transparent
  materials (glass, frosted) cast no shadows. The shadow map is 2048 px (the viewer uses 4096;
  see Open questions).
- **Office**: `navMesh` hidden; `Ambient` played looping on one `AnimationMixer`; the
  `status_glow` map and emissive map swapped for a W x 1 `DataTexture` (nearest, sRGB) whose
  texel N-1 eases to slot N's status colour (texels with no robot use `statusColors.off`);
  `lamp_glow` emissive intensity 0.15 by day, 1.6 at night; `day-only-*`, `night-only-*` and
  `night-light-*` toggled by time of day.
- **Robots**: one `robot.glb` load; each robot is a `SkeletonUtils.clone` with its own
  `AnimationMixer` playing the shared clips, and its own clone of the `primary` material.
  A three.js actor implements `office-sim`'s `Actor` port: `setPose(x, z, yaw)`,
  `play(clip, { once, fade })` (crossfade; one-shots clamp on their last frame), `duration(clip)`.
  Picking uses one invisible capsule per robot, so raycasts never skin vertices.
- **Camera**: `OrbitControls` with the viewer's settings (damping 0.12, polar 0.3 to 1.3,
  distance 0.8 to 34, left button pans, right rotates, touch one finger pans and two dolly and
  rotate) plus its wheel handling (ctrl-wheel or pinch zooms, two-finger scroll pans, notched
  wheel zooms). Follow mode eases the target to the robot each frame.
- **Removed**: the instanced bone-texture renderer, expression atlas and buffers, recast crowd
  and navmesh, POI manager, NPC and player drivers, character state machine, input manager's
  click-to-walk, `vec4-texture`, `tsl-typing-gaps` if unused.
- **Disposal**: `dispose()` stops the loop, disposes every geometry, material, texture
  (including the status `DataTexture`), mixer (`stopAllAction`, `uncacheRoot`), controls,
  listeners and the canvas, once; a disposed scene starts no work.
- **Per-frame cost**: five mixers, five `office-sim` agent updates (A* only on a new target, on a
  grid of about 30k cells), one ambient mixer. About 65 draw calls by day plus the shadow pass.

## API changes

None.

## Approach chosen + why

Approach A from planning: port `agent-sim.js` and use standard three.js animation, with
contract-shaped intents. It matches the behaviour agent-office already tests, gives animated
faces and correct one-shots with no custom shaders, and deletes the most complex code in the
scene. The cost (no instancing, no local avoidance) does not matter at five robots.

Filing, so rendering stays out of the way of future application code:

- `packages/office-sim`: what robots do and where they go. Pure TypeScript and zod, so the same
  code can run in a worker or behind Hono when an agent product needs server-side state.
- `packages/scene`: how it looks. three.js only, plus `office-sim` for movement; reads no app
  state; driven by intents.
- `apps/web/src/integration`: which states the robots are in (the live demo today) and when it
  is night. This is where application code plugs in.
- `apps/api` is unchanged.

## Open questions

Resolved 2026-10-24 (Isaac took the leans): shadow map 2048 px, raised only if it reads soft;
the model viewer plan (#62, #72 to #80) is closed as superseded; night is fixed at 19:00 to
07:00 local; keyboard picking is the agent pills above.

## Security considerations

- No keys, no LLM output, no network calls beyond loading same-origin static models.
- CSP unchanged: `'wasm-unsafe-eval'` is still needed for the meshopt decoder; `connect-src`
  stays `'self' data: blob:`.
- Scene extras are untrusted input to the parser: zod-validated, with size limits on the nav grid
  (cols x rows under a cap) so a malformed file cannot allocate without bound.

## Non-functional

- Load: about 1.0 MB of models (transport compression on a real host roughly thirds it),
  parallel with engine start and shader compile. Bundle shrinks by the recast wasm.
- Frame time: target 60 fps on an integrated GPU at the adaptive resolution floor; check the
  backquote render stats by day and at night (eight point lights).
- Licence: the new models are Isaac's, MIT with the code (his call, made 2026-10-24); the
  README's CC BY-NC models section goes, since Arturo Paracuellos' models leave the repo.
- Dependencies removed (approved with Approach A): `@recast-navigation/core`,
  `@recast-navigation/three`; with the optimise script gone, the scene's `@gltf-transform/*`,
  `draco3dgltf` and `meshoptimizer` devDependencies too. `bun.lock` changes accordingly.

## Work items

1. #85 feat(office-sim): port the agent-office movement logic
2. #86 feat(scene): ship the agent-office models and contract
3. #87 feat(scene): render the agent office and robots driven by office-sim (depends on #85, #86)
4. #88 feat(web): live demo, local time of day and agent pills (depends on #87)
5. #89 docs(repo): describe the agent office assets and the MIT models (depends on #87)
