import { z } from "zod";
import { Hono } from "hono";

import { errorBody } from "#/lib/errors";
import { isSupportedLocaleTag } from "#/lib/i18n";
import { SettingsService } from "#/services/settings-service";
import { initializeAgentFromHonoSession } from "./session-agent-hono";
import { notAuthenticated, sessionDid, sessionExpired, validateJson } from "./route-helpers";

import type { AppContext } from "#/index";

/**
 * Both locale columns are read back by formatters that reject a malformed
 * BCP-47 tag outright — `Intl.NumberFormat`/`toLocaleString` on the client
 * throw `RangeError`, which takes the page down — so an unusable tag is
 * rejected here rather than persisted and rendered later.
 *
 * @see [settings-controller.test.ts](../tests/settings-controller.test.ts):
 * "rejects a malformed locale tag" and "rejects an unsupported language".
 */
const localeTag = z.string().refine(isSupportedLocaleTag);

const CUSTOM_PROMPT_MAX_LENGTH = 100;
const DEFAULT_CLIENT_ID_MAX_LENGTH = 64;

const updateSchema = z.object({
  pdsSyncEnabled: z.boolean().optional(),
  imageTheme: z.string().min(1).nullable().optional(),
  inboxEnabled: z.boolean().optional(),
  profanityFilterEnabled: z.boolean().optional(),
  customPrompt: z.string().max(CUSTOM_PROMPT_MAX_LENGTH).nullable().optional(),
  profileCardTheme: z.string().nullable().optional(),
  touchpointLocale: localeTag.nullable().optional(),
  uiLocale: localeTag.nullable().optional(),
  /**
   * A waypoint id from Aturi's catalog, which only the client knows. Bounded
   * rather than enumerated: the catalog gains clients without a deploy here,
   * and an id this server has never heard of reads as "no preference" on the
   * way back out.
   *
   * @see [settings-controller.test.ts](../tests/settings-controller.test.ts):
   * "rejects an over-long default client id".
   */
  defaultClient: z.string().max(DEFAULT_CLIENT_ID_MAX_LENGTH).nullable().optional(),
  openProfilesInApp: z.boolean().optional(),
  atmosphereLinksEnabled: z.boolean().optional(),
});

export interface SettingsDeps {
  settingsService?: SettingsService;
}

export function createSettingsHono(ctx: AppContext, deps: SettingsDeps = {}): Hono {
  const app = new Hono();
  const settingsService = deps.settingsService ?? new SettingsService(ctx.db, ctx.logger);

  app.get("/settings", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    try {
      const userSettings =
        (await settingsService.getUserSettings(did)) ??
        (await settingsService.createDefaultSettings(did));
      return c.json(userSettings);
    } catch (err) {
      ctx.logger.error({ err, did }, "Failed to fetch user settings");
      return c.json(errorBody("SETTINGS_FETCH_FAILED", "Failed to fetch user settings"), 500);
    }
  });

  app.get("/stats", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    try {
      const stats = await settingsService.getStats(did);
      return c.json(stats);
    } catch (err) {
      ctx.logger.error({ err, did }, "Failed to fetch user stats");
      return c.json(errorBody("STATS_FETCH_FAILED", "Failed to fetch user stats"), 500);
    }
  });

  app.get("/pds-info", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    const agent = await initializeAgentFromHonoSession(c, ctx);
    if (!agent) return sessionExpired(c);
    try {
      const info = await settingsService.getPdsInfo(did, agent, ctx.idResolver);
      return c.json(info);
    } catch (err) {
      ctx.logger.error({ err, did }, "Failed to fetch PDS info");
      return c.json(errorBody("PDS_INFO_FETCH_FAILED", "Failed to fetch PDS info"), 500);
    }
  });

  app.post("/settings", validateJson(updateSchema), async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    const body = c.req.valid("json");
    try {
      /**
       * null and undefined must not be collapsed on the way through.
       * @see [settings-service.test.ts](../tests/settings-service.test.ts):
       * "should persist a null customPrompt to unset it" and "should update
       * only the provided fields on an existing row" pin the two meanings.
       */
      const updatedSettings = await settingsService.updateSettings(did, {
        pdsSyncEnabled: body.pdsSyncEnabled,
        // imageTheme is not nullable in the service, so null means "leave it".
        imageTheme: body.imageTheme ?? undefined,
        inboxEnabled: body.inboxEnabled,
        profanityFilterEnabled: body.profanityFilterEnabled,
        customPrompt: body.customPrompt,
        profileCardTheme: body.profileCardTheme,
        touchpointLocale: body.touchpointLocale,
        uiLocale: body.uiLocale,
        defaultClient: body.defaultClient,
        openProfilesInApp: body.openProfilesInApp,
        atmosphereLinksEnabled: body.atmosphereLinksEnabled,
      });
      ctx.logger.info({ did, updatedFields: Object.keys(body ?? {}) }, "Settings updated");
      return c.json(updatedSettings);
    } catch (err) {
      ctx.logger.error({ err, did }, "Failed to update user settings");
      return c.json(errorBody("SETTINGS_UPDATE_FAILED", "Failed to update user settings"), 500);
    }
  });

  return app;
}
