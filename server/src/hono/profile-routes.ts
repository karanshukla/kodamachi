import { z } from "zod";
import { Hono } from "hono";

import { errorBody, errorMessage } from "#/lib/errors";
import { AtmosphereService } from "#/services/atmosphere-service";
import { ProfileService } from "#/services/profile-service";
import { initializeAgentFromHonoSession } from "./session-agent-hono";
import {
  notAuthenticated,
  sessionDid,
  sessionExpired,
  validateParam,
  validateQuery,
} from "./route-helpers";

import type { AppContext } from "#/index";

const BOT_DID = "did:plc:3d4awubjiftylwrhhyp5vl7i";

const HANDLE_PARAM = z.object({ handle: z.string().min(1) });
const DID_PARAM = z.object({ did: z.string().min(1) });

export interface ProfileDeps {
  profileService?: ProfileService;
}

export function createProfileHono(ctx: AppContext, deps: ProfileDeps = {}): Hono {
  const app = new Hono();
  const profileService =
    deps.profileService ??
    new ProfileService(
      ctx.db,
      ctx.resolver,
      ctx.logger,
      new AtmosphereService(ctx.idResolver, ctx.logger)
    );

  app.get("/public-profile/:did", validateParam(DID_PARAM), async (c) => {
    const { did } = c.req.valid("param");
    try {
      const profileData = await profileService.getPublicProfile(did);
      return c.json(profileData);
    } catch (err: unknown) {
      if (errorMessage(err) === "Profile not found") {
        return c.json(errorBody("PROFILE_NOT_FOUND", "Profile not found"), 404);
      }
      ctx.logger.error({ err, did }, "Failed to fetch public profile");
      return c.json(errorBody("PROFILE_FETCH_FAILED", "Failed to fetch profile"), 500);
    }
  });

  app.get("/user-exists/:did", validateParam(DID_PARAM), async (c) => {
    const { did } = c.req.valid("param");
    try {
      const exists = await profileService.checkUserExists(did);
      return c.json({ exists, did });
    } catch (err) {
      ctx.logger.error({ err, did }, "Failed to check user existence");
      return c.json(
        errorBody("USER_EXISTENCE_CHECK_FAILED", "Failed to check user existence"),
        500
      );
    }
  });

  app.get("/friends", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    try {
      const result = await profileService.getFriendsOnApp(did);
      return c.json(result);
    } catch (err) {
      ctx.logger.error({ err, did }, "Failed to fetch friends on app");
      return c.json(errorBody("FRIENDS_FETCH_FAILED", "Failed to fetch friends"), 500);
    }
  });

  app.get("/check-bot-follow", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    const agent = await initializeAgentFromHonoSession(c, ctx);
    if (!agent) return sessionExpired(c);
    try {
      const following = await profileService.checkFollowsBot(agent, BOT_DID);
      return c.json({ following });
    } catch (err) {
      ctx.logger.error({ err, did }, "Failed to check bot follow status");
      return c.json(errorBody("BOT_FOLLOW_CHECK_FAILED", "Failed to check bot follow status"), 500);
    }
  });

  app.get("/handle-pds/:handle", validateParam(HANDLE_PARAM), async (c) => {
    const { handle } = c.req.valid("param");
    try {
      const did = await ctx.resolver.resolveHandleToDid(handle);
      if (!did) return c.json(errorBody("HANDLE_NOT_FOUND", "Handle not found"), 404);
      const atprotoData = await ctx.idResolver.did.resolveAtprotoData(did);
      const pdsUrl = new URL(atprotoData.pds);
      return c.json({ pds: pdsUrl.hostname });
    } catch (err) {
      ctx.logger.error({ err, handle }, "Failed to resolve PDS for handle");
      return c.json(errorBody("PDS_RESOLVE_FAILED", "Failed to resolve PDS"), 500);
    }
  });

  app.get(
    "/handle-search",
    validateQuery(z.object({ q: z.string().min(1).max(64) })),
    async (c) => {
      const { q } = c.req.valid("query");
      try {
        const actors = await profileService.searchActorsTypeahead(q);
        return c.json({ actors });
      } catch (err) {
        ctx.logger.error({ err }, "Failed to search handles");
        return c.json(errorBody("HANDLE_SEARCH_FAILED", "Failed to search handles"), 500);
      }
    }
  );

  app.get("/resolve-handle/:handle", validateParam(HANDLE_PARAM), async (c) => {
    const { handle } = c.req.valid("param");
    try {
      const did = await profileService.resolveHandleToDid(handle);
      return c.json({ did });
    } catch (err: unknown) {
      if (errorMessage(err) === "Handle not found") {
        return c.json(errorBody("HANDLE_NOT_FOUND", "Handle not found"), 404);
      }
      ctx.logger.error({ err, handle }, "Failed to resolve handle");
      return c.json(errorBody("HANDLE_RESOLVE_FAILED", "Failed to resolve handle"), 500);
    }
  });

  return app;
}
