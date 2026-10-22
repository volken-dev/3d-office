<p align="center">
  <img src="apps/web/public/images/the-delegation.svg" width="256" alt="The Delegation Logo">
</p>

> [!IMPORTANT]
> This experience requires **BYOK (Bring Your Own Key)**. You will need a **[Gemini API key](https://aistudio.google.com/app/apikey)** to run the simulation. You can also **clone or fork** this repository to run it locally.
<div align="center">
  <img src="apps/web/public/images/the-delegation-UI.jpg" width="100%" alt="The Delegation Hero">
</div>

<br/>

## What is The Delegation?

# A no-code 3D playground to explore, design, and interact with Agentic AI systems

This project is designed for **software teams and developers** looking to explore multi-agent collaboration on engineering work (specs, design docs, debugging, code review) in a living 3D office without writing a single line of code.

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
| `apps/web` | Next.js app (static export) |
| `apps/api` | Hono API server (prepared, not yet used by the web app) |
| `packages/shared` | API contract types and schemas shared by web and api |

Common tasks run from the repo root through Turborepo: `bun dev`, `bun run build`, `bun run lint`, `bun run typecheck`. Target one package with `bunx turbo run <task> --filter=web`.

## Backend

`apps/api` is a [Hono](https://hono.dev) app prepared for moving Gemini calls and key custody off the browser. The web app does not use it yet; it is still bring-your-own-key and ships as a static export.

```bash
cp apps/api/.env.example apps/api/.env   # set GEMINI_API_KEY and ALLOWED_ORIGINS
bunx turbo run dev --filter=api          # http://127.0.0.1:8787/api
```

| Route | What it does |
|---|---|
| `GET /api/health` | Liveness check |
| `POST /api/llm/completions` | Validates the body against `@the-delegation/shared`, calls Gemini with the server-side `GEMINI_API_KEY`, returns normalized output only |

- `src/app.ts` is runtime-agnostic (Bun, Workers or Node) and exports `AppType`; `src/index.ts` is the Bun entry. `bun run build` bundles it into a single `dist/index.js` for `bun run start`.
- The request and response contract (zod schemas plus inferred types, error shape, model allowlist and size caps) lives in `packages/shared`.
- The web app gets a typed client from `apps/web/src/lib/api-client.ts` (`hc<AppType>`, base URL from `NEXT_PUBLIC_API_URL`). It imports only types from `apps/api`, so no server code reaches the bundle.
- CORS allows only the origins listed in `ALLOWED_ORIGINS`. The per-IP rate limiter is in-memory and meant for development only. There is no authentication yet, so do not deploy this endpoint publicly before adding auth and a shared rate limiter.

## Features

### Agentic AI System (v0.2.0)

- **Team Editor (React Flow):** Create your own [multi-agent design patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) using an interactive node-based interface.
- **5 Software-Development Teams:** Templates to get you started: Feature Squad, Architecture Council, Bug Hunters, Code Review Board and a solo Staff Engineer.
- **Markdown Deliverables:** Each team delivers a Markdown document (spec, design doc, incident write-up, review) that you can review, edit and copy.
- **Per-Agent LLM:** Assign different [Gemini Models](https://ai.google.dev/gemini-api/docs/models) to specific roles (e.g., Flash for speed, Pro for reasoning).
- **Cost & Token Tracking:** Real-time estimation of usage costs and token consumption for transparency.
- **PR-style Workflows:** Learn about Pull Request and Review workflows where agents with `human-in-the-loop` properties require your approval to proceed.
- **Guardrails:** Controlled generation with the `Auto-approve output` option, ensuring quality before final asset production.
- **Technical Logs:** Improved visibility into raw LLM traces, tool calls, and structured agent responses.

### Embodied Simulation

- **Hybrid GPU/CPU Architecture:** A high-performance **3D simulation** built with **Three.js WebGPU** where autonomous LLM-powered characters collaborate in a shared physical workspace.
- **Intelligent Pathfinding:** NPCs utilize a NavMesh to navigate the office, finding and claiming specific "Points of Interest" (desks, seats, computers) based on their current task. Pathfinding is powered by [three-pathfinding](https://github.com/donmccurdy/three-pathfinding).
- **Dynamic State Machine:** Characters transition naturally between walking, sitting, working, and talking, with sync'ed 3D speech bubbles and expressions.

### Interactive UI

- **Team Flow Visualizer:** Real-time node-based view of your agent hierarchy and task flows.
- **Simulated PR Reviews:** Interactive modals for reviewing agent proposals, providing feedback, and merging tasks.
- **Real-time 3D Overlay:** Status indicators and interaction menus projected from 3D space into a polished UI.
- **Agent Inspector:** Select any agent to view their "thoughts", mission, and history.
- **Kanban & Action Logs:** Complete transparency into the agency's progress and tool-level interactions.

## Tech Stack Deep Dive

- **Engine:** [Three.js](https://threejs.org/) (WebGPU & TSL) for advanced rendering and compute.
- **App:** [Next.js](https://nextjs.org/) (static export), [shadcn/ui](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com/).
- **UI:** [React](https://react.dev/) & [React Flow](https://reactflow.dev/) for node-based team visualization.
- **AI:** [Gemini API](https://deepmind.google/technologies/gemini/) is the core LLM provider.
- **State:** [Zustand](https://github.com/pmndrs/zustand) for a unified, reactive store across the 3D world and React UI.
- **Tooling:** [Bun](https://bun.com) workspaces and [Turborepo](https://turborepo.com).
- **3D Assets:** Custom models and animations rigged in [Blender](https://blender.org), using an instanced animation system.

## Roadmap

- **World Building**
    - [ ] **Office/3D Space Editor:** Drag-and-drop workspace layout and POI customization.
    - [ ] **Dynamic Environment:** Real-time prop generation and environment modification by agents.
- **Advanced Interactions**
    - [ ] **Advanced Embodied AI:** Deeper integration between agent reasoning and physical 3D world actions.
    - [ ] **Enhanced Animations:** Richer character expressions and more fluid, context-aware animations.
    - [ ] **Human-Agent Spatial Interaction:** Direct collaboration and richer multi-party interactions in the 3D office.
    - [ ] **Inter-Agent Knowledge Sharing:** Long-term memory for agent teams across projects.
- **Refinement**
    - [ ] **Architecture Decoupling:** Further separation of core logic from the simulation environment.
    - [ ] **UX/UI Overhaul:** Unified CSS styling based on "The Delegation" brand identity.

## Developer Note

This release (**v0.2.0**) was developed entirely using **Google Antigravity** as the primary IDE and powered by **Gemini 3 Flash**.

## License & IP

This project follows a dual-licensing model:

- **Source Code (MIT):** All logic, shaders, and UI code are free to use, modify, and distribute.
- **3D Models & Assets (CC BY-NC 4.0):** The custom 3D office and character models are Copyright © 2026 **Arturo Paracuellos ([unboring.net](https://unboring.net))**. They are free for personal and educational use but _cannot_ be used for commercial purposes without permission.

Developed with ❤️ by [Arturo Paracuellos](https://unboring.net)
