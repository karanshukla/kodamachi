import type { Context } from "hono";
import type { ZodType } from "zod";
import { zValidator } from "@hono/zod-validator";

import { errorBody } from "#/lib/errors";
import { getSession } from "./session-middleware";

/**
 * Every route in this layer spells the same two preambles — reject a body that
 * failed its schema, reject a request with no session — and spelled them
 * eighteen and thirteen times respectively before this file existed. Sharing
 * them is what stops a new route from inventing a fourth name for the session
 * DID or a second shape for a validation failure.
 *
 * @see [error-codes.test.ts](../tests/error-codes.test.ts): pins that no route
 * reaches the wire with a prose `error` value instead of a code.
 */

/**
 * The `zValidator` failure hook shared by every schema in this layer, so a
 * malformed body always answers `{ errors: [...] }` with 400 rather than
 * whichever shape the route happened to write.
 */
export function rejectInvalid(
  result: { success: boolean; error?: { issues: unknown } },
  c: Context
) {
  if (!result.success) return c.json({ errors: result.error?.issues }, 400);
}

/** `zValidator` over a JSON body, wired to the shared failure hook. */
export function validateJson<T extends ZodType>(schema: T) {
  return zValidator("json", schema, rejectInvalid);
}

/** `zValidator` over path params, wired to the shared failure hook. */
export function validateParam<T extends ZodType>(schema: T) {
  return zValidator("param", schema, rejectInvalid);
}

/** `zValidator` over the query string, wired to the shared failure hook. */
export function validateQuery<T extends ZodType>(schema: T) {
  return zValidator("query", schema, rejectInvalid);
}

/** The 403 every authenticated route answers a session-less request with. */
export function notAuthenticated(c: Context) {
  return c.json(errorBody("NOT_AUTHENTICATED", "Not authenticated"), 403);
}

/** The 401 a route answers when the session outlived its Bluesky OAuth grant. */
export function sessionExpired(c: Context) {
  return c.json(errorBody("SESSION_EXPIRED", "Session expired"), 401);
}

/**
 * The DID of the signed-in account, or undefined when nothing is signed in.
 * Named so every route calls the session DID `did` rather than picking between
 * `userDid`, `userSessionDid` and `recipient` for the same value.
 */
export function sessionDid(c: Context): string | undefined {
  return getSession(c)?.did;
}
