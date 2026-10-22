import type { Server } from "bun"
import app from "./app"

const port = Number(Bun.env.PORT) || 8787
const hostname = Bun.env.HOST || "127.0.0.1"

// biome-ignore lint/suspicious/noConsole: the server entry point announces where it is listening
console.info(`api listening on http://${hostname}:${port}/api`)

/** Bun entry point: adapts the runtime-agnostic app, passing process env plus the peer address as bindings. */
export default {
  port,
  hostname,
  fetch: (request: Request, server: Server<undefined>) =>
    app.fetch(request, { ...Bun.env, CLIENT_IP: server.requestIP(request)?.address }),
}
