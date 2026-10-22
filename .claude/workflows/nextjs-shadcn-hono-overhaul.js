export const meta = {
  name: 'nextjs-shadcn-hono-overhaul',
  description: 'Audit the codebase into AUDIT.md, migrate Vite->Next.js, convert UI to shadcn, clean slop, fix perf, scaffold Hono backend',
  phases: [
    { title: 'Audit', detail: '7 dimension auditors (read-only)' },
    { title: 'Synthesize', detail: 'write actionable AUDIT.md' },
    { title: 'Migrate', detail: 'Vite -> Next.js static export + shadcn init' },
    { title: 'Fix', detail: '6 owners on disjoint file sets' },
    { title: 'Integrate', detail: 'typecheck/lint/build green, update AUDIT.md' },
    { title: 'Review', detail: 'independent regression review + fix' },
  ],
}

const REPO = '/Users/isaac/Projects/3d-office'
const CONTEXT = `
Repo: ${REPO} (git branch refactor/nextjs-shadcn-hono, base commit ${args.base}).
"The Delegation": a 3D office (Three.js WebGPU + TSL, src/simulation) where Gemini-powered LLM agents (src/core: AgentBrain, PromptBuilder, ToolRegistry, tools, GeminiProvider) collaborate on software-development tasks (spec, design docs, debugging, code review). React 19 UI in src/interface, Zustand stores in src/integration/store (coreStore, uiStore, teamStore), team templates in src/data/agents.ts. Users bring their own Gemini key (stored in localStorage); the app is a static site deployed to GitHub Pages under base path /the-delegation/ (.github/workflows/deploy.yml). Tailwind v4 via @tailwindcss/vite, lucide-react icons, @xyflow/react for the team editor, react-markdown.
Recent work already done (do not redo): media generation removed (text-only output), per-frame character screen positions moved out of Zustand into src/integration/screenPositions.ts (ref-anchored overlay bubbles), whole-store subscriptions replaced with selectors/useShallow, adaptive pixel ratio + paused rendering in design mode (src/simulation/core/Engine.ts, SceneManager.ts), React Flow lazy-loaded.
Agreed target architecture:
- Next.js (current stable, App Router, src/app) with output: 'export', basePath '/the-delegation', images unoptimized, trailingSlash as needed for GitHub Pages. Everything touching three/WebGPU/window is client-only (next/dynamic with ssr:false). Keep the existing src/ directory structure for non-route code (src/interface, src/core, src/integration, src/simulation, src/data) so file paths stay stable.
- shadcn/ui native UI: Tailwind v4, CSS-variable theming, components in src/components/ui, cn() in src/lib/utils.ts, brand colors (src/theme/brand.ts, the darkDelegation color etc.) mapped onto shadcn tokens. The 3D scene/simulation code is NOT converted.
- Hono backend prepared (not yet used by the UI, the app stays BYOK): server/ directory, edge-runtime-friendly Hono app, shared/ for API contract types, typed client via hono/client.
Ground rules for every agent: never commit, never run destructive git commands (reset, checkout of files, clean, stash). Do not change the visual look of the 3D scene. Remove slop as you go in files you own: dead code, commented-out code, narrating/obvious comments, stale comments, console.log debugging, \`any\` where a real type is easy, duplicated JSX/logic. Keep genuinely useful "why" comments.`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          files: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths, with :line where useful' },
          evidence: { type: 'string', description: 'what the code does now, concretely, quoting identifiers' },
          impact: { type: 'string' },
          recommendation: { type: 'string', description: 'specific actionable fix' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          owner: { type: 'string', enum: ['modals', 'panels', 'configurator', 'core', 'simulation', 'backend', 'infra'] },
        },
        required: ['title', 'severity', 'files', 'evidence', 'impact', 'recommendation', 'effort', 'owner'],
      },
    },
  },
  required: ['findings'],
}

const OWNERS = `Owner routing for each finding:
- modals: src/interface/{AuditModal,BYOKModal,DeleteTaskModal,FinalOutputModal,InfoModal,OutputReviewModal,PricingModal,ResetModal,TeamFlowModal}.tsx
- panels: src/interface/{ActionLogPanel,AgentStatusPanel,ChatPanel,Header,InspectorPanel,KanbanPanel,ProjectView,SimulationView,UIOverlay}.tsx, src/interface/components/**, src/App.tsx, src/main.tsx, src/index.css
- configurator: src/interface/VisualConfigurator/**
- core: src/core/**, src/integration/**, src/data/**, src/types.ts, src/theme/**
- simulation: src/simulation/**
- backend: anything about a future server/API, key handling moving server-side, shared contracts
- infra: build tooling, package.json, tsconfig, CI/deploy, README, repo hygiene`

const DIMENSIONS = [
  { key: 'performance', focus: 'Performance: per-frame work, React re-renders (selector misuse, inline objects/arrays recreated every render, unmemoized derived data like getAllAgents/getAllCharacters per render), store update frequency and size (agentHistories, debugLog holding raw SDK responses), allocations in hot loops, GPU readback, bundle size and code splitting, expensive CSS (backdrop-blur over the canvas, animations), large lists without virtualization, intervals/heartbeats. Include src/simulation for CPU/GPU hot paths.' },
  { key: 'reliability', focus: 'Reliability/correctness: race conditions in the agent loop (isThinking guards, heartbeat/processScheduledTasks, concludeProject re-entry), unhandled promise rejections, error handling and user-visible error states, state that can get stuck (phase never reaching done, tasks stuck on_hold), JSON.parse without try/catch, persisted store migrations, cleanup of subscriptions/intervals/listeners on unmount or team switch, stale closures, setTimeout leaks.' },
  { key: 'security', focus: 'Security: Gemini API key handling (localStorage, being appended to URLs, logged, sent in debug logs/exports), XSS via react-markdown or dangerouslySetInnerHTML, prompt injection from user/LLM content flowing into tool calls and state, unsafe external links (target=_blank without rel), dependency risks, CSP feasibility on GitHub Pages, what must change when a Hono backend proxies LLM calls (rate limiting, auth, key custody).' },
  { key: 'comprehensibility', focus: 'Comprehensibility and slop: misleading/stale/narrating comments, commented-out code, dead code and unused exports/files/state fields, inconsistent naming (e.g. interface vs components, CharacterState used as UI store type), magic numbers, giant components that should be split, duplicated logic (activeTeam lookup repeated, duplicated JSX), any-typing, mixed semicolon/quote styles, files whose name does not match contents. Be specific: list the exact comments/blocks to delete.' },
  { key: 'usability', focus: 'Usability and accessibility of the React UI: keyboard navigation and focus management in modals, missing labels/aria, buttons implemented as divs, color contrast (tiny 7-9px uppercase text), responsive behavior at small widths, empty/loading/error states, confusing copy left over from the old media-generation product, onboarding (no API key), destructive actions without confirmation or with too much confirmation. Map each issue to which shadcn primitive would fix it (Dialog, AlertDialog, Tooltip, Select, Switch, Tabs, ScrollArea, Sonner, etc.).' },
  { key: 'architecture', focus: 'Modularity, scalability and backend readiness: coupling between src/core agent logic and Zustand/React (getState calls inside core, core importing UI stores), layering violations (simulation <-> stores <-> UI), global singletons, what must be extracted so agent orchestration could later run on a Hono server, how the store shape would scale with more agents/teams/projects, persistence strategy, testability (there are no tests: what seams are needed), and module boundaries for the Next.js migration.' },
  { key: 'migration', focus: 'Next.js + shadcn migration risk survey: every use of window/document/localStorage/navigator at module scope or during render (SSR hazards, e.g. uiStore reads localStorage at store creation), Vite-specific code (import.meta.env, ?raw/?url imports, vite.config define of process.env.GEMINI_API_KEY, base path assumptions, the @ alias), asset URL resolution under basePath (models, draco decoder in public/vendor, images), three/webgpu ESM import constraints, the GitHub Pages deploy workflow, and an inventory of every hand-rolled UI primitive (modal, select, toggle, tooltip, tabs, button styles) with the shadcn component that should replace it.' },
]

phase('Audit')
const audits = await parallel(DIMENSIONS.map(d => () => agent(
  `${CONTEXT}

You are a senior engineer auditing this codebase for ONE dimension. READ-ONLY: do not modify any files.
Dimension: ${d.focus}

Read the actual code (src/**, package.json, configs, .github) thoroughly; do not guess. Only report issues you have confirmed in the code, with concrete file:line evidence. Prefer fewer, high-signal, actionable findings over vague advice, but be comprehensive within the dimension (typically 8-25 findings). Each recommendation must be specific enough that another engineer can implement it without re-investigating.
${OWNERS}`,
  { label: `audit:${d.key}`, phase: 'Audit', schema: FINDINGS }
).then(r => r && r.findings.map(f => ({ ...f, dimension: d.key })))))

const allFindings = audits.filter(Boolean).flat()
log(`${allFindings.length} findings across ${audits.filter(Boolean).length}/${DIMENSIONS.length} dimensions`)

phase('Synthesize')
await agent(
  `${CONTEXT}

Write ${REPO}/AUDIT.md from the raw audit findings below (JSON). This is the ONLY file you may create or modify.
Requirements:
- Deduplicate overlapping findings across dimensions (merge evidence, keep the strongest severity). Spot-check any finding that looks doubtful by reading the cited code; drop findings that are wrong.
- Give every item a stable ID by category prefix (PERF-01, REL-01, SEC-01, CODE-01, UX-01, ARCH-01, MIG-01) ordered by severity.
- Structure: short executive summary (top 5 risks), a scorecard table per dimension (performance, reliability, security, comprehensibility, usability, scalability, modularity) with a 1-5 rating and one-line justification, then one section per category with a table: ID | Severity | Title | Files | Recommendation | Effort | Owner | Status. Status starts as "Open". Below each table, a short detail block per high/critical item with evidence and the fix.
- End with a "Roadmap" section: Now (this refactor), Next (backend adoption: moving LLM calls/key custody to Hono, persistence), Later.
- Actionable and concise; no filler.

Raw findings:
${JSON.stringify(allFindings)}`,
  { label: 'synthesize:AUDIT.md', phase: 'Synthesize' }
)

phase('Migrate')
const migration = await agent(
  `${CONTEXT}

You own the Vite -> Next.js migration. Relevant audit findings (MIG/infra), use them as a checklist:
${JSON.stringify(allFindings.filter(f => f.dimension === 'migration' || f.owner === 'infra'))}

Do all of the following, then make \`npx tsc --noEmit\` and \`npm run build\` pass:
1. Install current stable next (16.x) and remove vite, @vitejs/plugin-react, @tailwindcss/vite, vite.config.ts, index.html, src/main.tsx, src/vite-env.d.ts and any Vite-only code (import.meta.env, the process.env.GEMINI_API_KEY define, the AI Studio DISABLE_HMR leftover). Use @tailwindcss/postcss for Tailwind v4. Move build tooling/types to devDependencies.
2. App Router under src/app: layout.tsx (metadata/OG tags from the old index.html, fonts, global CSS) and page.tsx that renders the existing App via next/dynamic({ ssr: false }) from a 'use client' boundary. next.config.ts: output 'export', basePath '/the-delegation', images.unoptimized, reactStrictMode (check the SceneManager mount/unmount survives strict-mode double effects; if not, keep strict mode off and say why in a one-line comment).
3. Fix SSR hazards: no window/localStorage/document access at module scope or during render on the server (e.g. uiStore llmConfig initializer). Zustand persist should use storage that is safe when localStorage is unavailable.
4. Make every runtime asset URL (GLB models, draco decoder in public/vendor, images like images/the-delegation.svg, og image) resolve correctly under basePath, preferably via one helper (e.g. src/lib/asset.ts using process.env.NEXT_PUBLIC_BASE_PATH set in next.config) rather than relying on relative URLs.
5. tsconfig for Next (paths alias @/* -> src/*), eslint flat config with eslint-config-next, scripts: dev, build, start (serve the static out/ dir is fine), lint, typecheck.
6. Initialize shadcn/ui for Tailwind v4 (components.json, src/lib/utils.ts cn, CSS variables in the global stylesheet with light theme; map the brand palette in src/theme/brand.ts and the existing custom tokens such as darkDelegation and any @theme values onto shadcn tokens: primary = the dark brand color, accent/ring from USER_COLOR, etc.). Keep the existing custom utility classes working so not-yet-converted components still render. Then add these components up front so later agents never need to install anything: button, dialog, alert-dialog, input, textarea, label, select, switch, tooltip, tabs, scroll-area, badge, card, separator, dropdown-menu, popover, sonner, skeleton, toggle, toggle-group, collapsible, sheet. Mount <Toaster /> and <TooltipProvider> in the client app shell.
7. Update .github/workflows/deploy.yml (and release.yml if it builds) to build with Next and upload ./out. Add .gitignore entries (.next, out, next-env.d.ts handling).
8. Update the README "Getting Started"/tech-stack sections for Next.js.
Do not convert existing components to shadcn yourself (other agents will) and do not touch src/simulation except asset URL resolution. Keep src/ paths of existing modules unchanged.
Return a concise report: files created/removed, decisions made (strict mode, asset helper API, theme token mapping), and anything left broken.`,
  { label: 'migrate:nextjs+shadcn', phase: 'Migrate', effort: 'high' }
)

phase('Fix')
const forOwner = o => JSON.stringify(allFindings.filter(f => f.owner === o))
const SHADCN_RULES = `Convert to shadcn-native: replace hand-rolled modals with Dialog/AlertDialog (proper focus trap, Esc, aria), selects with Select, toggles with Switch, hover hints with Tooltip, tab bars with Tabs, scroll containers with ScrollArea, ad-hoc buttons with Button variants, pills with Badge, inputs with Input/Textarea+Label, transient notices with sonner toast. Use theme tokens (bg-background, text-muted-foreground, bg-primary...) instead of hard-coded hex/zinc where reasonable, keep the existing visual identity (dark brand, rounded, uppercase micro-labels) but raise unreadably small text (< 10px) to legible sizes. Fix the usability/a11y findings for your files. All shadcn components already exist in src/components/ui; do NOT install packages or add new shadcn components (if one is truly missing, write it by hand in src/components/ui following shadcn conventions). Keep component behavior and store wiring identical unless a finding says otherwise. Keep zustand selectors fine-grained (no whole-store subscriptions).`
const OWNERSHIP_RULES = `You may edit ONLY the files you own (listed below). Other agents are editing other files concurrently, so typecheck errors in files you do not own may be transient; fix errors in your files only. If you need a change outside your ownership, do not make it: put it in your report under "Cross-cutting follow-ups". Run \`npx tsc --noEmit\` before finishing.`

const FIXERS = [
  { key: 'modals', files: 'src/interface/{AuditModal,BYOKModal,DeleteTaskModal,FinalOutputModal,InfoModal,OutputReviewModal,PricingModal,ResetModal,TeamFlowModal}.tsx', task: `${SHADCN_RULES} Also: BYOKModal onboarding (clear guidance when no key, key never shown in full, link out with rel="noopener noreferrer"), FinalOutputModal hard-coded "Generated March 2026" label -> real timestamp or removed, consistent confirm flows (AlertDialog for destructive reset).` },
  { key: 'panels', files: 'src/interface/{ActionLogPanel,AgentStatusPanel,ChatPanel,Header,InspectorPanel,KanbanPanel,ProjectView,SimulationView,UIOverlay}.tsx, src/interface/components/**, src/App.tsx, src/app/** (page/layout only), the global stylesheet', task: `${SHADCN_RULES} Split oversized components (ActionLogPanel ~550 lines, UIOverlay, InspectorPanel) into focused subcomponents in the same folder. UIOverlay bubbles are positioned per-frame via useAgentAnchor refs (src/integration/screenPositions.ts): keep that mechanism, keep them cheap (avoid backdrop-blur on per-frame-moving elements). Memoize derived data (getAllAgents/getAllCharacters per render). Large lists (logs, chat) should not re-render all items on each append.` },
  { key: 'configurator', files: 'src/interface/VisualConfigurator/**', task: `${SHADCN_RULES} The React Flow canvas itself stays React Flow; convert the surrounding panels (TeamsPanel, TeamCard, AgentConfigPanel, ColorPicker, SystemDebugOverlay, node chrome) to shadcn. Remove duplicated tree-update logic and any-typing.` },
  { key: 'core', files: 'src/core/**, src/integration/** (stores, hooks, screenPositions), src/data/**, src/types.ts, src/theme/**', task: `Fix the reliability, security, performance and comprehensibility findings for these files. Decouple agent orchestration from React/Zustand where practical so it can later run behind a Hono server: introduce small interfaces (e.g. an LLM client interface + a project-state port) instead of core modules calling useXStore.getState() everywhere, without changing runtime behavior. Centralize the repeated active-team lookup. Type the tool-call args and LLM responses (remove any). Rename CharacterState to an accurate name. Bound memory: debugLog should not retain full raw SDK responses indefinitely. Constraint: keep the public API of the stores and hooks that UI files consume backwards compatible in this pass (same field and action names), because UI agents are editing consumers concurrently; list desired breaking renames as follow-ups instead.` },
  { key: 'simulation', files: 'src/simulation/**', task: `Fix the performance and reliability findings for the 3D simulation WITHOUT changing how the scene looks or behaves: hot-loop allocations (Vector3 per call in getCPUPosition, updatePaths), listener/observer/subscription cleanup on dispose and team switch (InputManager listeners are never removed, AgentSimulation intervals), dead code and slop comments. Do not change materials, lighting, camera framing, animation logic or TSL shaders except to remove dead code.` },
  { key: 'backend', files: 'server/**, shared/**, src/lib/api-client.ts, package.json (scripts and server deps only; the migration agent already set up the rest), a tsconfig for the server if needed, README (new Backend section only)', task: `Scaffold the Hono backend so it is ready to adopt but not yet used by the UI (the app stays BYOK and statically exported). Use current stable hono. Structure: server/app.ts builds and exports the Hono app and \`export type AppType\` using chained routes so hono/client gets types; server/routes/health.ts (GET /api/health); server/routes/llm.ts with a POST /api/llm/completions route that validates input with zod (@hono/zod-validator) against contract types in shared/, reads GEMINI_API_KEY from the environment binding, and proxies to Gemini via @google/genai (this is the future replacement for BYOK; keep it small and correct); middleware for CORS (configurable allowed origin), request id, secure headers, a simple per-IP rate-limit placeholder clearly marked as in-memory/dev-only, and JSON error handling. Keep server/app.ts runtime-agnostic (works on Cloudflare Workers/Bun/Node); add server/node.ts dev entry with @hono/node-server and a \`dev:server\` script (tsx watch), plus wrangler-free instructions. shared/ holds request/response types and zod schemas (do not move or import from src/; the core agent owns src/core). src/lib/api-client.ts exports a typed \`hc<AppType>\` client factory using NEXT_PUBLIC_API_URL. Add a .env.example. Ensure server code is excluded from the Next build/typecheck where needed but typechecks on its own (add a typecheck:server script).` },
]

const fixes = await parallel(FIXERS.map(f => () => agent(
  `${CONTEXT}

Migration report from the previous step (Next.js + shadcn are now set up):
${migration}

Your area: ${f.key}. Files you own: ${f.files}
${OWNERSHIP_RULES}

Task: ${f.task}

Audit findings assigned to your area (AUDIT.md has the merged, ID'd version; read it and reference IDs in your report):
${forOwner(f.key)}

Return a concise report: what you changed per file, which AUDIT.md IDs you resolved, anything deliberately skipped with reason, and "Cross-cutting follow-ups".`,
  { label: `fix:${f.key}`, phase: 'Fix' }
).then(r => ({ key: f.key, report: r }))))

phase('Integrate')
const integration = await agent(
  `${CONTEXT}

Six agents just edited disjoint parts of the repo in parallel after a Vite -> Next.js migration. You are the integrator. Their reports (including cross-cutting follow-ups) are below.

1. Make it green: \`npx tsc --noEmit\`, the server typecheck script, \`npm run lint\` (fix real issues; do not blanket-disable rules), and \`npm run build\` (Next static export to out/). Fix errors in any file.
2. Apply the cross-cutting follow-ups that are safe and small; list the rest.
3. Grep for leftovers: Vite references, import.meta.env, unused files/exports/dependencies (remove unused deps from package.json), stray console.log, dead components, references to removed media features, hand-rolled modal/select/toggle UI that was missed in src/interface (convert if small).
4. Verify the static export: out/ contains index.html under the basePath expectations and asset URLs (models, draco, images) resolve with the /the-delegation prefix (inspect the built HTML/JS for the asset paths).
5. Update AUDIT.md: set each item's Status to Fixed / Partially fixed / Open based on the reports and your own verification of the code (check, don't trust reports blindly), and add a short "Changes in this refactor" section.
Return: final command outputs summary (pass/fail for each), what you fixed, and what remains open.

Reports:
${JSON.stringify(fixes.filter(Boolean))}`,
  { label: 'integrate', phase: 'Integrate', effort: 'high' }
)

phase('Review')
const REVIEW = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          problem: { type: 'string' },
          failure_scenario: { type: 'string' },
          fix: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['file', 'problem', 'failure_scenario', 'fix', 'severity'],
      },
    },
  },
  required: ['issues'],
}
const review = await agent(
  `${CONTEXT}

Independent review, READ-ONLY. Review \`git diff ${args.base}\` plus untracked files (git status) for regressions introduced by this refactor. Focus on behavior the user would notice: the 3D scene not mounting or mounting twice, overlay bubbles not following characters, agent loop flow (brief -> tasks -> review -> deliver -> final output), team switching/reset, BYOK key entry, persisted store hydration on first load and with existing localStorage data, modal open/close/focus behavior after the shadcn conversion, design-mode team editor, asset loading under basePath, and anything in the Hono scaffold that is insecure or wrong (e.g. key leakage, permissive CORS by default). Only report confirmed problems with a concrete failure scenario; no style nits.`,
  { label: 'review:regressions', phase: 'Review', schema: REVIEW }
)

let reviewFix = 'No issues reported.'
if (review && review.issues.length) {
  reviewFix = await agent(
    `${CONTEXT}

A reviewer found these issues in the current working tree. Verify each against the code; fix the real ones, explain any you reject. Then re-run \`npx tsc --noEmit\`, \`npm run lint\` and \`npm run build\` and make sure they pass. Update AUDIT.md statuses if affected.
Issues:
${JSON.stringify(review.issues)}
Return: per-issue outcome (fixed/rejected + why) and final command results.`,
    { label: 'review:fix', phase: 'Review' }
  )
}

return {
  findingsCount: allFindings.length,
  migration,
  fixes: fixes.filter(Boolean).map(f => ({ key: f.key, report: f.report })),
  integration,
  review: review ? review.issues : null,
  reviewFix,
}
