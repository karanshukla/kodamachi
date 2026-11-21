import { z } from "zod";
import { Hono } from "hono";

import { errorBody } from "#/lib/errors";
import { NotificationService } from "#/services/notification-service";
import { getAccounts, type AppSessionData } from "#/auth/session";
import { getSession } from "./session-middleware";
import { notAuthenticated, sessionDid, validateJson } from "./route-helpers";

import type { AppContext } from "#/index";

const PUSH_NOT_CONFIGURED = "Web push not configured";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export interface NotificationDeps {
  notificationService?: NotificationService;
}

export function createNotificationHono(ctx: AppContext, deps: NotificationDeps = {}): Hono {
  const app = new Hono();
  const notificationService =
    deps.notificationService ?? new NotificationService(ctx.db, ctx.resolver, ctx.logger);

  app.get("/notifications/vapid-public-key", async (c) => {
    const vapidPublicKey = notificationService.getVapidPublicKey();
    if (!vapidPublicKey) {
      return c.json(errorBody("PUSH_NOT_CONFIGURED", PUSH_NOT_CONFIGURED), 501);
    }
    return c.json({ vapidPublicKey });
  });

  app.post("/notifications/subscribe", validateJson(subscribeSchema), async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    if (!notificationService.getVapidPublicKey()) {
      return c.json(errorBody("PUSH_NOT_CONFIGURED", PUSH_NOT_CONFIGURED), 501);
    }
    const { endpoint, keys } = c.req.valid("json");
    try {
      await notificationService.saveSubscription(did, endpoint, keys.p256dh, keys.auth);
      const signedInDids = getAccounts(getSession(c) as AppSessionData).map(
        (account) => account.did
      );
      await notificationService.syncSubscriptionsAcrossAccounts(signedInDids);
      ctx.logger.info({ did }, "Push subscription registered");
      return c.json({ ok: true }, 201);
    } catch (err) {
      ctx.logger.error({ err, did }, "Failed to save push subscription");
      return c.json(errorBody("PUSH_SUBSCRIBE_FAILED", "Failed to save subscription"), 500);
    }
  });

  app.delete(
    "/notifications/subscribe",
    validateJson(z.object({ endpoint: z.string().url() })),
    async (c) => {
      const did = sessionDid(c);
      if (!did) return notAuthenticated(c);
      const { endpoint } = c.req.valid("json");
      try {
        await notificationService.deleteSubscription(did, endpoint);
        ctx.logger.info({ did }, "Push subscription removed");
        return c.json({ ok: true });
      } catch (err) {
        ctx.logger.error({ err, did }, "Failed to delete push subscription");
        return c.json(errorBody("PUSH_UNSUBSCRIBE_FAILED", "Failed to delete subscription"), 500);
      }
    }
  );

  return app;
}
