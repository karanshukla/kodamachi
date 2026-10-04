import { rateLimiter } from "hono-rate-limiter";

import type { Context } from "hono";

const ONE_MINUTE_MS = 60 * 1000;

/**
 * Per sender and recipient, on top of the global per-IP limit, since
 * `/messages/send` takes no session.
 *
 * @see [rate-limits.test.ts](../tests/rate-limits.test.ts): "accepts a fiftieth
 * question to one recipient" and "rejects a fifty-first".
 */
export const SEND_LIMIT_PER_RECIPIENT = 50;
export const SEND_WINDOW_MS = 10 * ONE_MINUTE_MS;

const TOO_MANY = "Too many requests, please try again later.";

/** Local dev has no proxy hop, so all requests share the "local" bucket. */
function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  return xff ? xff.split(",")[0].trim() : "local";
}

async function recipientOf(c: Context): Promise<string> {
  const body = await c.req.json().catch(() => null);
  return typeof body?.recipient === "string" ? body.recipient : "";
}

export function perIpRateLimiter(limit: number) {
  return rateLimiter({
    windowMs: ONE_MINUTE_MS,
    limit,
    standardHeaders: "draft-6",
    message: TOO_MANY,
    keyGenerator: clientIp,
  });
}

export function sendRateLimiter() {
  return rateLimiter({
    windowMs: SEND_WINDOW_MS,
    limit: SEND_LIMIT_PER_RECIPIENT,
    standardHeaders: "draft-6",
    message: TOO_MANY,
    keyGenerator: async (c) => `${clientIp(c)} ${await recipientOf(c)}`,
  });
}
