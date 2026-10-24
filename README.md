<p align="center">
  <img src="apps/web/public/images/the-delegation.svg" width="256" alt="The Delegation Logo">
</p>

## What is this?

# A 3D office in the browser

The agent office rendered with Three.js WebGPU (falling back to WebGL2): a room of pods, docking bays, a conveyor and racks, and five robots working in it. Each robot is an agent slot. The robots walk in from the door, then a live demo gives every robot a new agent state every 8 to 20 seconds (working, shipping, waiting for input, idle, paused or rate limited, error, done); the robot walks to a place for that state, sits down or plugs in, and its body and its pod or bay light take the state's status colour. The office follows your local time: day from 07:00, night with lamps and a night sky from 19:00.

Drag to pan, right-drag or shift-drag to rotate, pinch or scroll to zoom. A row of agent pills sits at the top of the screen, one per robot with a dot in its status colour: Tab moves between them, and focusing or clicking a pill (or clicking a robot) makes the camera follow that robot. Esc, or a click on empty floor, returns to the overview. There is no player character.

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
| `packages/scene` | The 3D office: renderer, office and robots, camera, plus the synced models and asset contract |
| `packages/office-sim` | How robots move: walk grid, A* paths, POI reservation, agent states. No three.js, no DOM (zod only) |
| `packages/shared` | API contract schemas (health response, error envelope) |

Common tasks run from the repo root through Turborepo: `bun dev`, `bun run build`, `bun run lint`, `bun run typecheck`, `bun run test`. Target one package with `bunx turbo run <task> --filter=web`.

### Assets

The office and the robot are not edited here. They are generated from code in the separate agent-office project (`~/Projects/agent-office`), against a versioned asset contract, and this repo ships its build output byte for byte:

- `packages/scene/assets/models/office.glb` and `robot.glb`, already Meshopt-compressed (`EXT_meshopt_compression`, decoded in the browser by three's `MeshoptDecoder`) with WebP textures.
- `packages/scene/assets/asset-contract.json`: the contract (agent states, POI kinds, enter and exit clips per POI, status colours, the files and what each must contain).

To update them, build agent-office, then run `bun run assets` in `packages/scene`. It copies those three files from agent-office's `dist/` (path from the first argument or `AGENT_OFFICE_DIST`, default `../../../agent-office/dist`), prints which changed, and refuses a contract whose major version differs from the one the code supports, since a major bump renames or removes something the scene relies on. The web app copies the models into `apps/web/public/models/` (gitignored) before every dev and build. `packages/scene/test/assets/asset-contract.test.ts` checks the shipped models against the contract (nodes, clips, materials, morph targets, POIs, scene extras).

What the code reads from the office:

- **Points of interest** are empty nodes named `poi-<kind>-<id>` (for example `poi-sit_work-3`); position and yaw come from the node. The contract's `poses` and `transitions` say which kinds a state uses and which clips a robot plays to get in and out.
- **Scene extras** carry the walk grid (`nav`, a base64 bit grid with obstacles already inflated), approach points (`approach`), the agent states and their POIs (`agentStates`), the status colours (`statusColors`) and the number of agent slots (`agents`). They are parsed with zod at load, and a mismatch fails the load naming the field.
- **Day and night** nodes are named `day-only-*`, `night-only-*` and `night-light-*`; the office's `Ambient` clip loops.

`packages/office-sim` is a TypeScript port of agent-office's reference movement, `viewer/agent-sim.js`: A* over the walk grid with string pulling, POI reservation so no two robots hold one place, enter and exit clips, and the lobby `Roster`. It talks to the renderer through a small `Actor` port (`setPose`, `play`, `duration`), so it could run in a worker or behind the API later.

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

- **WebGPU rendering**, falling back to WebGL2, with adaptive resolution and recovery when the GPU device is lost.
- **The agent office's look:** hemisphere and sun lighting with soft shadows, neutral tone mapping, the office's baked ambient occlusion, and day and night by local time.
- **Robots that move like the reference:** grid A* with string pulling to a POI's approach point, a turn, the contract's enter clips, the state's loop, and exit clips when leaving. Faces animate through morph targets.
- **Status colours** on each robot and on its pod and bay light, eased between states.
- **Agent pills** with keyboard selection and camera follow.
- **Render stats** in development builds (backquote key): frame, CPU and GPU time, draw calls, triangles and pixel ratio.

## Tech Stack

- **Engine:** [Three.js](https://threejs.org/) WebGPU renderer with WebGL2 fallback, `AnimationMixer` for every clip.
- **Simulation:** `packages/office-sim`, plain TypeScript and [zod](https://zod.dev).
- **App:** [Next.js](https://nextjs.org/) (static export), [shadcn/ui](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com/).
- **API:** [Hono](https://hono.dev) with zod contracts.
- **Tooling:** [Bun](https://bun.com) workspaces, [Turborepo](https://turborepo.com) and [Biome](https://biomejs.dev).
- **3D Assets:** generated in agent-office, Meshopt-compressed with WebP textures.

## Developer Note

This release (**v0.2.0**) was developed entirely using **Google Antigravity** as the primary IDE and powered by **Gemini 3 Flash**.

## License

MIT, for the code and the 3D models alike. See [LICENSE](LICENSE).

Developed with ❤️ by [Arturo Paracuellos](https://unboring.net)
