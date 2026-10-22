---
description: Scaffold an apps/api route group from the llm.ts pattern — runtime-agnostic Hono, shared zod contract, rate limit + body limit, zValidator, ApiHttpError — and mount it in app.ts.
argument-hint: "<resource>  e.g. sessions"
allowed-tools: Read, Edit, Write, Bash
---

Scaffold a new API route group for `$ARGUMENTS`. Mirror `apps/api/src/routes/llm.ts` (and `health.ts` for a trivial read) — don't invent a new shape. The API is prepared but not yet used by the UI; confirm this route is in scope before writing it.

Read: `routes/llm.ts`, `routes/health.ts`, `app.ts`, `env.ts`, `errors.ts`, `middleware/rate-limit.ts`, and `packages/shared/src/api.ts`.

1. **Contract first:** add the request and response zod schemas (and their inferred types) to `packages/shared/src/`, with any size caps as named constants beside them.
2. Create `apps/api/src/routes/$ARGUMENTS.ts` exporting `const $ARGUMENTS = new Hono<AppEnv>()`:
   - Write routes: `.use(inMemoryRateLimit())` then `.use(bodyLimit({ maxSize, onError }))` throwing `ApiHttpError(413, ...)`, before any handler reads the body.
   - Validate with `zValidator('json' | 'query' | 'param', <SharedSchema>, hook)` and read input only via `c.req.valid(...)`.
   - Throw `ApiHttpError` for expected failures; never hand-build error JSON (`handleError` formats it with the request id). Normalise upstream errors; never pass their raw text through.
   - No Bun/Node/Workers globals; read env through `c.env`.
3. **Mount it:** `.route('/$ARGUMENTS', $ARGUMENTS)` in `apps/api/src/app.ts`, and add any new allowed method or header to the CORS config.
4. Add a typed call through `hc<AppType>` in `apps/web/src/lib/api-client.ts` only if the UI uses it now.
5. Run `/registration-parity`, then `/health-check api`, and exercise the route over HTTP (`curl`) including one invalid body and one oversize body.

A test goes in `apps/api/test/routes/$ARGUMENTS.test.ts` once a runner exists (ARCH-09).
