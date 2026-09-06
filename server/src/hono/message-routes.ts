import { z } from "zod";
import { Hono } from "hono";

import { errorBody, errorMessage } from "#/lib/errors";
import {
  INBOX_CLOSED,
  MESSAGE_NOT_FOUND,
  MessageService,
  NOT_AUTHORIZED_TO_DELETE,
  RECIPIENT_NOT_FOUND,
} from "#/services/message-service";
import { NotificationService } from "#/services/notification-service";
import {
  QUESTION_NOT_IN_INBOX,
  RenderService,
  type RenderedQuestionImage,
} from "#/services/render-service";
import { clearSession } from "./session-middleware";
import { initializeAgentFromHonoSession } from "./session-agent-hono";
import { notAuthenticated, sessionDid, validateJson } from "./route-helpers";

import type { AppContext } from "#/index";

/** The key expired, was lost to a deploy, or has already been posted with. */
const NO_READY_RENDER = "That question image is no longer available.";

/** What `/messages/send` accepts, and so the longest a stored question can be. */
export const MAX_MESSAGE_LENGTH = 500;

export interface MessageDeps {
  messageService?: MessageService;
  notificationService?: NotificationService;
  renderService?: RenderService;
}

export function createMessageHono(ctx: AppContext, deps: MessageDeps = {}): Hono {
  const app = new Hono();
  const messageService =
    deps.messageService ?? new MessageService(ctx.db, ctx.resolver, ctx.logger);
  const notificationService =
    deps.notificationService ?? new NotificationService(ctx.db, ctx.resolver, ctx.logger);
  // One instance per sub-app, and the sub-app is built once at boot, so the
  // render store outlives the request that filled it.
  const renderService = deps.renderService ?? new RenderService(ctx.db, ctx.resolver, ctx.logger);

  app.post(
    "/messages/example",
    validateJson(z.object({ recipient: z.string().min(1) })),
    async (c) => {
      const recipient = sessionDid(c);
      if (!recipient)
        return c.json(errorBody("RECIPIENT_DID_REQUIRED", "Recipient DID required"), 403);
      try {
        const settings = await ctx.db
          .selectFrom("user_settings")
          .selectAll()
          .where("did", "=", recipient)
          .executeTakeFirst();
        const messages = await messageService.addExampleMessages(recipient, settings?.uiLocale);
        return c.json({ messages });
      } catch (err) {
        ctx.logger.error({ err, recipient }, "Failed to add example messages");
        return c.json(errorBody("EXAMPLE_MESSAGES_FAILED", "Failed to add example messages"), 500);
      }
    }
  );

  /**
   * @see [message-controller.test.ts](../tests/message-controller.test.ts) —
   * pins that a warm the image service cannot serve still answers 202, since
   * the caller is typing rather than waiting.
   */
  app.post("/messages/warm-image", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    messageService
      .warmImageService()
      .catch((err) => ctx.logger.error({ err, did }, "Failed to warm image service"));
    return c.json({ ok: true }, 202);
  });

  /**
   * The render is queued; the post never is. Answering with an image blocks on
   * a cold `image-gen` container — a Railway wake plus a Chromium launch — and
   * cold is the common case rather than the edge case, so the user watched a
   * spinner for the whole wake and lost the reply outright if it timed out.
   *
   * Unlike `/messages/respond`, nothing downstream of this costs the caller a
   * Bluesky post, so the render itself is the only thing rationing it. The
   * question has to be one of theirs and it has to fit what an inbox can hold.
   *
   * @see [render-controller.test.ts](../tests/render-controller.test.ts) — pins
   * that an identical enqueue produces one render and a theme change produces
   * a second, that an unknown key reads as `unknown` rather than `failed`, and
   * that a question outside the caller's inbox is refused before it renders.
   */
  app.post(
    "/messages/render",
    validateJson(
      z.object({
        tid: z.string().min(1),
        original: z.string().min(1).max(MAX_MESSAGE_LENGTH),
        theme: z.string().min(1).optional(),
      })
    ),
    async (c) => {
      const did = sessionDid(c);
      if (!did) return notAuthenticated(c);
      const { tid, original, theme } = c.req.valid("json");
      try {
        const enqueued = await renderService.enqueue({ did, tid, original, theme });
        return c.json(enqueued, 202);
      } catch (err) {
        if (errorMessage(err) === QUESTION_NOT_IN_INBOX) {
          ctx.logger.warn({ tid, did }, "Render requested for a question outside the inbox");
          return c.json(errorBody("RENDER_QUESTION_NOT_IN_INBOX", QUESTION_NOT_IN_INBOX), 404);
        }
        ctx.logger.error({ err, tid, did }, "Failed to enqueue question image render");
        return c.json(errorBody("RENDER_START_FAILED", "Failed to start the image render"), 500);
      }
    }
  );

  app.get("/messages/render/:renderId", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    return c.json(renderService.readStatus(c.req.param("renderId"), did));
  });

  app.post(
    "/messages/respond",
    validateJson(
      z.object({
        tid: z.string().min(1),
        recipient: z.string().min(1),
        original: z.string().min(1).max(MAX_MESSAGE_LENGTH),
        response: z.string().min(1).max(MAX_MESSAGE_LENGTH),
        includeQuestionAsImage: z.boolean().optional(),
        renderId: z.string().min(1).optional(),
        replyTo: z.object({ uri: z.string(), cid: z.string().optional() }).passthrough().optional(),
      })
    ),
    async (c) => {
      const { tid, recipient, original, response, includeQuestionAsImage, renderId, replyTo } =
        c.req.valid("json");
      const did = sessionDid(c);
      if (!did) {
        ctx.logger.warn("No authenticated user session found");
        return notAuthenticated(c);
      }
      const agent = await initializeAgentFromHonoSession(c, ctx);
      if (!agent) {
        ctx.logger.warn({ did }, "No agent could be initialized from session");
        return c.json({ isLoggedIn: false, profile: null, did: null });
      }

      let preRendered: RenderedQuestionImage | undefined;
      if (includeQuestionAsImage && renderId) {
        const claim = renderService.claimReady(renderId, did);
        if (!claim.ok) {
          ctx.logger.info(
            { renderId, tid, did, status: claim.status },
            "Respond found no ready render"
          );
          return c.json({ status: claim.status, error: claim.error ?? NO_READY_RENDER }, 409);
        }
        preRendered = claim.image;
        ctx.logger.info({ renderId, tid, did }, "Respond used a pre-rendered question image");
      }

      try {
        const result = await messageService.respondToMessage(
          tid,
          did,
          recipient,
          original,
          response,
          includeQuestionAsImage || false,
          agent,
          replyTo,
          preRendered
        );
        return c.json(result);
      } catch (err: unknown) {
        ctx.logger.error(
          { err, tid, did },
          "Error in /messages/respond endpoint while trying to post to Bluesky"
        );
        return c.json(errorBody("BLUESKY_POST_FAILED", "Failed to post to Bluesky"), 500);
      }
    }
  );

  app.post(
    "/messages/send",
    validateJson(
      z.object({
        recipient: z.string().min(1),
        message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
      })
    ),
    async (c) => {
      const { recipient, message } = c.req.valid("json");
      try {
        const result = await messageService.sendMessage(recipient, message);
        ctx.logger.debug({ recipient }, "Anonymous message sent");
        notificationService
          .sendNewMessageNotification(recipient)
          .catch((err) =>
            ctx.logger.error({ err, did: recipient }, "Failed to send push notification")
          );
        return c.json(result);
      } catch (err: unknown) {
        ctx.logger.error({ err, recipient }, "Failed to send message");
        const rejection = errorMessage(err);
        if (rejection === RECIPIENT_NOT_FOUND) {
          return c.json(errorBody("USER_NOT_FOUND", RECIPIENT_NOT_FOUND), 404);
        }
        if (rejection === INBOX_CLOSED) {
          return c.json(errorBody("INBOX_CLOSED", INBOX_CLOSED), 403);
        }
        return c.json(errorBody("MESSAGE_SEND_FAILED", "Failed to send message"), 500);
      }
    }
  );

  app.get("/messages/:recipient", async (c) => {
    const recipient = sessionDid(c);
    if (!recipient) return notAuthenticated(c);
    try {
      const messages = await messageService.getMessages(recipient);
      return c.json({ messages });
    } catch (err: unknown) {
      if (errorMessage(err).includes("not exist")) {
        return c.json(
          errorBody("USER_NOT_FOUND", "User not found (user profile does not exist)"),
          404
        );
      }
      ctx.logger.error({ err, recipient }, "Failed to fetch messages");
      return c.json(errorBody("MESSAGES_FETCH_FAILED", "Failed to fetch messages"), 500);
    }
  });

  app.delete("/messages/:tid", async (c) => {
    const tid = c.req.param("tid");
    if (!tid) return c.json(errorBody("MESSAGE_TID_REQUIRED", "Message TID required"), 400);
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    const agent = await initializeAgentFromHonoSession(c, ctx);
    if (!agent) {
      ctx.logger.warn({ did }, "No agent could be initialized from session");
      return c.json({ isLoggedIn: false, profile: null, did: null });
    }
    try {
      await messageService.deleteMessage(tid, did, agent);
      return c.json({ success: true });
    } catch (err: unknown) {
      const rejection = errorMessage(err);
      if (rejection === MESSAGE_NOT_FOUND) {
        return c.json(errorBody("MESSAGE_NOT_FOUND", MESSAGE_NOT_FOUND), 404);
      }
      if (rejection === NOT_AUTHORIZED_TO_DELETE) {
        return c.json(errorBody("MESSAGE_DELETE_NOT_AUTHORIZED", NOT_AUTHORIZED_TO_DELETE), 403);
      }
      ctx.logger.error({ err, tid, did }, "Failed to delete message");
      return c.json(errorBody("MESSAGE_DELETE_FAILED", "Failed to delete message"), 500);
    }
  });

  app.delete("/delete-account", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    const agent = await initializeAgentFromHonoSession(c, ctx);
    if (!agent) {
      return c.json(
        errorBody(
          "AGENT_INIT_FAILED",
          "Authentication failed - could not initialize agent or retrieve user DID"
        ),
        401
      );
    }
    try {
      await messageService.deleteUserData(did, agent);
      notificationService
        .deleteAllSubscriptionsForUser(did)
        .catch((err) => ctx.logger.error({ err, did }, "Failed to delete push subscriptions"));
      clearSession(c);
      ctx.logger.info({ did }, "Account and all data deleted");
      return c.json({ success: true });
    } catch (err: unknown) {
      ctx.logger.error({ err, did }, "Failed to delete account data");
      return c.json(errorBody("ACCOUNT_DELETE_FAILED", "Failed to delete account data"), 500);
    }
  });

  app.post("/messages/sync", async (c) => {
    const did = sessionDid(c);
    if (!did) return notAuthenticated(c);
    const userSettings = await ctx.db
      .selectFrom("user_settings")
      .selectAll()
      .where("did", "=", did)
      .executeTakeFirst();
    if (!userSettings?.pdsSyncEnabled) {
      return c.json({ success: true, message: "PDS sync is disabled" });
    }
    const agent = await initializeAgentFromHonoSession(c, ctx);
    if (!agent) {
      return c.json(
        errorBody("AGENT_INIT_FAILED", "Authentication failed - could not initialize agent"),
        401
      );
    }
    try {
      const syncResult = await messageService.syncMessages(did, agent);
      return c.json(syncResult);
    } catch (err: unknown) {
      ctx.logger.error({ err, did }, "Failed to sync messages to PDS");
      return c.json(
        {
          ...errorBody("PDS_SYNC_FAILED", "Failed to sync messages to PDS"),
          details: errorMessage(err),
        },
        500
      );
    }
  });

  return app;
}
