// Mounts a sub-app behind middleware that injects c.var.session from a header, so tests drive real Hono dispatch with mock services.

import { Hono } from "hono";

import { SESSION_VAR, type SessionVars } from "#/hono/session-middleware";

import type { AppSessionData } from "#/auth/session";

/** Injects a session from the JSON `x-test-session` header, then delegates to the sub-app. */
export function withTestSession(subApp: Hono): Hono<{ Variables: SessionVars }> {
  const wrapper = new Hono<{ Variables: SessionVars }>();
  wrapper.use("*", async (c, next) => {
    const raw = c.req.header("x-test-session");
    if (raw) {
      try {
        c.set(SESSION_VAR, JSON.parse(raw) as AppSessionData);
      } catch {
        c.set(SESSION_VAR, null);
      }
    } else {
      c.set(SESSION_VAR, null);
    }
    await next();
  });
  wrapper.route("/", subApp);
  return wrapper;
}

export function sessionHeader(session: AppSessionData | null): Record<string, string> {
  return { "x-test-session": JSON.stringify(session) };
}

export { SESSION_VAR };
