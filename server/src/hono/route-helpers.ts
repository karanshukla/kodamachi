import type { Context } from "hono";
import type { ZodType } from "zod";
import { zValidator } from "@hono/zod-validator";

import { errorBody } from "#/lib/errors";
import { getSession } from "./session-middleware";

/**
 * The shared `zValidator` failure hook: always 400 `{ errors: [...] }`.
 *
 * @see [error-codes.test.ts](../tests/error-codes.test.ts): pins that no route
 * reaches the wire with a prose `error` value instead of a code.
 */
export function rejectInvalid(
  result: { success: boolean; error?: { issues: unknown } },
  c: Context
) {
  if (!result.success) return c.json({ errors: result.error?.issues }, 400);
}

export function validateJson<T extends ZodType>(schema: T) {
  return zValidator("json", schema, rejectInvalid);
}

export function validateParam<T extends ZodType>(schema: T) {
  return zValidator("param", schema, rejectInvalid);
}

export function validateQuery<T extends ZodType>(schema: T) {
  return zValidator("query", schema, rejectInvalid);
}

export function notAuthenticated(c: Context) {
  return c.json(errorBody("NOT_AUTHENTICATED", "Not authenticated"), 403);
}

export function sessionExpired(c: Context) {
  return c.json(errorBody("SESSION_EXPIRED", "Session expired"), 401);
}

export function sessionDid(c: Context): string | undefined {
  return getSession(c)?.did;
}
