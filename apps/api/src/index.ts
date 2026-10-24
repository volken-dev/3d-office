import app from "./app"

const port = Number(Bun.env.PORT) || 8787
const hostname = Bun.env.HOST || "127.0.0.1"

// biome-ignore lint/suspicious/noConsole: the server entry point announces where it is listening
console.info(`api listening on http://${hostname}:${port}/api`)

/** Bun entry point for the runtime-agnostic app. */
export default { port, hostname, fetch: app.fetch }
