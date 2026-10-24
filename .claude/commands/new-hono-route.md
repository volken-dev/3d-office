---
description: Scaffold an apps/api route group from the health.ts pattern — runtime-agnostic Hono, a shared zod contract, body limit and validation for input — and mount it in app.ts.
argument-hint: "<resource>  e.g. sessions"
allowed-tools: Read, Edit, Write, Bash
---

Scaffold a new API route group for `$ARGUMENTS`. Mirror `apps/api/src/routes/health.ts` — don't invent a new shape. The web app does not call the API today; confirm this route is in scope (it is likely a new feature) before writing it.

Read: `routes/health.ts`, `app.ts`, `env.ts`, `errors.ts`, and `packages/shared/src/api.ts`.

1. **Contract first:** add the request and response zod schemas (and their inferred types) to `packages/shared/src/`, with any size caps as named constants beside them. Add any new error code to `API_ERROR_CODES`.
2. Create `apps/api/src/routes/$ARGUMENTS.ts` exporting `const $ARGUMENTS = new Hono<AppEnv>()`:
   - Routes that read a body: `.use(bodyLimit({ maxSize, onError }))` before any handler reads it.
   - Validate input with zod against the shared schema before using it. Adding `@hono/zod-validator` is a dependency change: ask first.
   - Return errors through `errorBody` / `handleError` so they carry the request id; never pass upstream error text through.
   - No Bun/Node/Workers globals; read env through `c.env` (add the binding to `AppEnv` in `env.ts`).
3. **Mount it:** `.route('/$ARGUMENTS', $ARGUMENTS)` in `apps/api/src/app.ts`. A browser caller also needs CORS, which the app no longer has: add it deliberately, with an origin allowlist.
4. Add a test in `apps/api/test/routes/$ARGUMENTS.test.ts` (via `app.request`), including one invalid input.
5. Run `/registration-parity`, then `/health-check api`, and exercise the route over HTTP (`curl`).
