import type { Context, MiddlewareHandler } from "hono"
import type { AppEnv } from "../env"
import { ApiHttpError } from "../errors"

const WINDOW_MS = 60_000
const DEFAULT_LIMIT = 20
const MAX_TRACKED_CLIENTS = 10_000

type Bucket = { count: number; resetAt: number }

/** Bun supplies the peer address as a binding; on Workers the cf-connecting-ip header carries it. */
function clientIp(context: Context<AppEnv>): string {
  return context.env?.CLIENT_IP ?? context.req.header("cf-connecting-ip") ?? "unknown"
}

/**
 * DEV ONLY: fixed-window per-IP limiter held in this process's memory. It resets on restart, is not shared between
 * instances or Worker isolates, and cannot see real client IPs behind an untrusted proxy. Replace it with a shared
 * store (Cloudflare Rate Limiting, a Durable Object or KV counter) plus per-token quotas before this API is public.
 */
export function inMemoryRateLimit(): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, Bucket>()

  return async (context, next) => {
    const limit = Number(context.env?.RATE_LIMIT_PER_MINUTE) || DEFAULT_LIMIT
    const now = Date.now()
    const clientKey = clientIp(context)

    if (buckets.size > MAX_TRACKED_CLIENTS) {
      for (const [trackedKey, trackedBucket] of buckets) {
        if (trackedBucket.resetAt <= now) buckets.delete(trackedKey)
      }
    }

    let bucket = buckets.get(clientKey)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + WINDOW_MS }
      buckets.set(clientKey, bucket)
    }
    bucket.count += 1

    const remaining = Math.max(0, limit - bucket.count)
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000)
    context.header("RateLimit-Limit", String(limit))
    context.header("RateLimit-Remaining", String(remaining))
    context.header("RateLimit-Reset", String(resetSeconds))

    if (bucket.count > limit) {
      throw new ApiHttpError(429, "rate_limited", "Too many requests", {
        "Retry-After": String(resetSeconds),
      })
    }
    await next()
  }
}
