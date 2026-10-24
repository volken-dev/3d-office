<p align="center">
  <img src="apps/web/public/images/the-delegation.svg" width="256" alt="The Delegation Logo">
</p>

## What is this?

# A 3D office in the browser

A small office rendered with Three.js WebGPU (falling back to WebGL2). You are one of the characters: click the floor to walk, click a seat to sit, drag to orbit and scroll to zoom. A cast of NPCs wanders, sits and idles on its own; click one and the camera follows it, click empty space and it follows you again.

This repo began as The Delegation, a 3D playground where LLM agents collaborated on software work in the office. That product was removed on 2026-10-24 (#81); git history has it.

## Getting Started

Requires [Bun](https://bun.com) 1.3+.

```bash
bun install
bun dev
```

Then open `http://localhost:3000`.

### Repository layout

This is a [Turborepo](https://turborepo.com) monorepo using Bun workspaces:

| Path | What it is |
|---|---|
| `apps/web` | Next.js app (static export): the office in a full-window canvas |
| `apps/api` | Minimal Hono API: a health route |
| `packages/scene` | The 3D office: renderer, characters, navigation and points of interest, plus the models and their asset pipeline |
| `packages/shared` | API contract schemas (health response, error envelope) |

Common tasks run from the repo root through Turborepo: `bun dev`, `bun run build`, `bun run lint`, `bun run typecheck`, `bun run test`. Target one package with `bunx turbo run <task> --filter=web`.

### 3D models

Exported models are sources, not what the browser loads. They live in `packages/scene/assets-src/models/`; `bun run assets` (in `packages/scene`) builds the optimised copies in `packages/scene/assets/models/`, which are committed alongside them. The web app copies those into `apps/web/public/models/` (gitignored) before every dev and build.

1. Export from Blender with **File > Export > glTF 2.0**:
   - Format: **glTF Binary (.glb)**.
   - Include: the objects you want, plus **Custom Properties** (the office needs them for its points of interest).
   - Mesh: **Apply Modifiers**, **UVs** and **Normals** on; tangents and vertex colours off. **Compression off**: the pipeline compresses (it can still read Draco-compressed files).
   - Material: **Export**; images **Automatic** (PNG or JPEG).
   - Animation: **Skinning** on, shape keys off, actions exported as clips named after `AnimationName` (`Idle`, `Walk`, `Sit_Work`, ...). Missing clips fall back to `Idle`.
   - Office naming the scene relies on: the walkable mesh's name contains `navmesh` (any case) and team-coloured meshes start with `colored`. Points of interest are described by custom properties, not names (see below).
2. Save the `.glb` to `packages/scene/assets-src/models/`. A new character also needs an entry in `packages/scene/src/characters/character-models.ts`.
3. Run `bun run assets` in `packages/scene` and commit both the source and the output.

The script ([`packages/scene/scripts/optimize-models.ts`](packages/scene/scripts/optimize-models.ts), using [glTF Transform](https://gltf-transform.dev)) deduplicates, prunes unreferenced data (keeping names, empty POI nodes and extras), welds identical vertices, resamples animations, quantizes normals and skin weights, and applies Meshopt compression (`EXT_meshopt_compression`, decoded in the browser by three's `MeshoptDecoder`). Positions and UVs stay full precision so the scene looks exactly as exported. It always starts from the sources, so it is safe to rerun: unchanged sources give byte-identical output.

#### Points of interest

A point of interest is an empty in the office with a `poi` custom property (exported as glTF node `extras`, which three reads into `userData`). `PoiManager` validates them at load against `OfficePoiExtrasSchema` in [`packages/scene/src/world/office-poi-extras.ts`](packages/scene/src/world/office-poi-extras.ts) and throws, naming the node, if one is malformed. The node's name is free.

| `poi` | Other property | What characters do there | POI id |
|---|---|---|---|
| `spawn` | `slot`: the index of the character that starts here and returns here after work | stand (`idle`) | `spawn-<slot>` |
| `desk` | `slot`: the index of the character that works here | sit and work (`sit_work`) | `desk-<slot>` |
| `seat` | `slot`: any number unique among seats | sit (`sit_idle`); the player can pick it | `seat-<slot>` |
| `area` | `area`: a lowercase name (`a-z`, `0-9`, `_`); `boardroom` is the meeting area | gather facing the centre (`idle`) | `area-<area>` |

Slots are integers. The scene builds every POI id through [`packages/scene/src/world/poi-ids.ts`](packages/scene/src/world/poi-ids.ts), so lookups cannot drift from the parser. `packages/scene/test/world/poi-manager.test.ts` loads `assets/models/office.glb` and fails if the navmesh, the boardroom, or a spawn or desk for characters 1 to 5 is missing or off the navmesh (`apps/web/test/data/office-cast.test.ts` keeps the office cast within those indices); `character-models.test.ts` does the same for every `AnimationName` clip in each character GLB.

The current office was exported with the POIs encoded in their names only, so `bun scripts/add-poi-extras.ts` (in `packages/scene`) stamped the properties onto the source from those names. It edits only the GLB's JSON, leaves nodes that already have a `poi` property alone, and is safe to rerun after a re-export from a Blender file without the custom properties; once the Blender file has them, it is not needed.

## Backend

`apps/api` is a minimal [Hono](https://hono.dev) app. The web app does not call it today.

```bash
cd apps/api && bun run dev      # or `bun dev` at the root for web and api together; api on :8787
curl http://127.0.0.1:8787/api/health
```

| Route | What it does |
|---|---|
| `GET /api/health` | Liveness check: `{ "status": "ok", "time": "<ISO time>" }` |

- `src/app.ts` is runtime-agnostic (Bun, Workers or Node) and exports `createApp` and `AppType`; `src/index.ts` is the Bun entry.
- Responses are typed with the schemas in `packages/shared`; every error uses one envelope with a request id.
- It binds to `127.0.0.1` by default (`HOST` and `PORT` override it). There is no sign-in: do not expose it publicly.

## Features

- **WebGPU rendering with TSL**, falling back to WebGL2, with adaptive resolution and recovery when the GPU device is lost.
- **Pathfinding:** characters walk a NavMesh through a Detour crowd ([recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)), so they steer around each other.
- **Points of interest:** desks, seats, spawns and shared areas read from the office model, claimed by the characters that use them.
- **Character state machine:** walking, sitting, working, talking and idling, with facial expressions and an instanced animation system.
- **Render stats** in development builds (backquote key): frame, CPU and GPU time, draw calls, triangles and pixel ratio.

## Tech Stack

- **Engine:** [Three.js](https://threejs.org/) (WebGPU & TSL).
- **App:** [Next.js](https://nextjs.org/) (static export), [shadcn/ui](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com/).
- **API:** [Hono](https://hono.dev) with [zod](https://zod.dev) contracts.
- **Tooling:** [Bun](https://bun.com) workspaces, [Turborepo](https://turborepo.com) and [Biome](https://biomejs.dev).
- **3D Assets:** Custom models and animations rigged in [Blender](https://blender.org), optimised with [glTF Transform](https://gltf-transform.dev).

## Developer Note

This release (**v0.2.0**) was developed entirely using **Google Antigravity** as the primary IDE and powered by **Gemini 3 Flash**.

## License & IP

This project follows a dual-licensing model:

- **Source Code (MIT):** All logic, shaders, and UI code are free to use, modify, and distribute.
- **3D Models & Assets (CC BY-NC 4.0):** The custom 3D office and character models are Copyright © 2026 **Arturo Paracuellos ([unboring.net](https://unboring.net))**. They are free for personal and educational use but _cannot_ be used for commercial purposes without permission.

Developed with ❤️ by [Arturo Paracuellos](https://unboring.net)
