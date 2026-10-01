// Kept first by convention; see the module for why order does not decide which error wins.
import "#/lib/assert-fetch-node-patch";

import dns from "node:dns";

import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import pino from "pino";

import { createDb, migrateToLatest } from "./database/db";
import { assertProductionBindHost, WILDCARD_HOSTS } from "./lib/assert-production-bind-host";
import { createBidirectionalResolver, createIdResolver } from "./lib/id-resolver";
import { createAuthHono } from "./hono/auth-routes";
import { createMessageHono } from "./hono/message-routes";
import { createNotificationHono } from "./hono/notification-routes";
import { createProfileHono } from "./hono/profile-routes";
import { createSettingsHono } from "./hono/settings-routes";
import { liveDidMiddleware, sessionMiddleware, type SessionVars } from "./hono/session-middleware";

import type { Database } from "./database/db";
import type { IdResolver } from "@atproto/identity";
import type { OAuthClient } from "@atproto/oauth-client-node";
import type { BidirectionalResolver } from "./lib/id-resolver";

import { createClient } from "#/auth/client";
import { APP_NAME } from "#/lib/brand";
import { env } from "#/lib/env";

// Windows hangs on DNS TXT lookups via the system resolver.
function redirectWindowsDnsToPublicResolvers(): void {
  if (process.platform !== "win32") return;
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
}

redirectWindowsDnsToPublicResolvers();

// These paths carry user-authored content and must never reach Axiom, even if a logger call dumps a whole object.
const USER_CONTENT_REDACT_PATHS = [
  "message",
  "updates.message",
  "updates.customPrompt",
  "*.message",
  "*.customPrompt",
];

function createLogger(): pino.Logger {
  const { AXIOM_TOKEN, AXIOM_DATASET } = env;
  const redact = USER_CONTENT_REDACT_PATHS;
  if (!AXIOM_TOKEN || !AXIOM_DATASET) {
    return pino({ name: APP_NAME, redact });
  }
  const transport = pino.transport({
    targets: [
      {
        target: "@axiomhq/pino",
        options: { dataset: AXIOM_DATASET, token: AXIOM_TOKEN },
        level: "info",
      },
      { target: "pino/file", options: { destination: 1 }, level: "info" },
    ],
  });
  return pino({ name: APP_NAME, redact }, transport);
}

export type AppContext = {
  db: Database;
  logger: pino.Logger;
  oauthClient: OAuthClient;
  resolver: BidirectionalResolver;
  idResolver: IdResolver;
};

function corsForClient(clientUrl: string) {
  return cors({
    origin: clientUrl,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 600,
  });
}

function perIpRateLimiter(limit: number) {
  return rateLimiter({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: "draft-6",
    message: "Too many requests, please try again later.",
    // Local dev has no proxy hop, so all requests share the "local" bucket.
    keyGenerator: (c) => {
      const xff = c.req.header("x-forwarded-for");
      return xff ? xff.split(",")[0].trim() : "local";
    },
  });
}

/** Every route takes a small JSON body; the largest, `/messages/respond`, is a few KB. */
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
};

function mountDomainRoutes(app: Hono<{ Variables: SessionVars }>, ctx: AppContext): void {
  app.route("/", createAuthHono(ctx));
  app.route("/", createMessageHono(ctx));
  app.route("/", createProfileHono(ctx));
  app.route("/", createSettingsHono(ctx));
  app.route("/", createNotificationHono(ctx));
}

function buildApp(
  ctx: AppContext,
  { clientUrl, rateLimitMax }: { clientUrl: string; rateLimitMax: number }
): Hono<{ Variables: SessionVars }> {
  const app = new Hono<{ Variables: SessionVars }>();

  app.use("*", corsForClient(clientUrl));
  app.use("*", bodyLimit({ maxSize: MAX_REQUEST_BODY_BYTES }));
  if (rateLimitMax > 0) {
    app.use("*", perIpRateLimiter(rateLimitMax));
  }
  app.use("*", sessionMiddleware);
  app.use("*", liveDidMiddleware(ctx.db));
  app.use("*", noStore);

  mountDomainRoutes(app, ctx);

  app.notFound((c) =>
    c.json(
      { error: "Not Found", message: "The requested resource does not exist", status: 404 },
      404
    )
  );

  app.onError((err, c) => {
    ctx.logger.error({ err }, "unhandled error in hono app");
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}

class Server {
  constructor(
    public server: ReturnType<typeof Bun.serve>,
    public ctx: AppContext
  ) {}

  static async create(): Promise<Server> {
    const { NODE_ENV, HOST, PORT, DB_PATH, CLIENT_URL, RATE_LIMIT_MAX } = env;

    assertProductionBindHost();
    const logger = createLogger();

    const db = await createDb(DB_PATH);
    await migrateToLatest(db);

    const oauthClient = await createClient(db);
    const baseIdResolver = createIdResolver();
    const resolver = createBidirectionalResolver(baseIdResolver);
    const ctx: AppContext = {
      db,
      logger,
      oauthClient,
      resolver,
      idResolver: baseIdResolver,
    };

    const app = buildApp(ctx, { clientUrl: CLIENT_URL, rateLimitMax: RATE_LIMIT_MAX });

    const { server, boundHost } = await serveDualStack(PORT, HOST, app.fetch, logger);
    logger.info(`Server (${NODE_ENV}) running on http://${boundHost}:${PORT}`);

    return new Server(server, ctx);
  }

  async close(): Promise<void> {
    this.ctx.logger.info("sigint received, shutting down");
    const waitForInFlightRequests = true;
    this.server.stop(waitForInFlightRequests);
    try {
      await this.ctx.db.destroy();
    } catch (err) {
      this.ctx.logger.error({ err }, "Failed to drain database pool");
    }
    this.ctx.logger.info("server closed");
  }
}

/**
 * Binds a wildcard HOST as "::" (dual-stack): Railway's private network, Caddy's
 * only route here, is IPv6-only. Falls back to "0.0.0.0" without IPv6 (Docker bridges).
 */
async function serveDualStack(
  port: number,
  host: string,
  fetch: (req: Request) => Response | Promise<Response>,
  logger: pino.Logger
): Promise<{ server: ReturnType<typeof Bun.serve>; boundHost: string }> {
  const wildcard = WILDCARD_HOSTS.has(host);
  const tryHost = wildcard ? "::" : host;
  try {
    const server = Bun.serve({ port, hostname: tryHost, fetch });
    return { server, boundHost: server.hostname ?? tryHost };
  } catch (err) {
    if (!wildcard) throw err;
    logger.warn({ err, host }, "IPv6 wildcard bind failed, falling back to 0.0.0.0");
    const server = Bun.serve({ port, hostname: "0.0.0.0", fetch });
    return { server, boundHost: "0.0.0.0" };
  }
}

const FORCED_SHUTDOWN_TIMEOUT_MS = 10_000;

const run = async () => {
  const server = await Server.create();

  const onCloseSignal = async () => {
    setTimeout(() => process.exit(1), FORCED_SHUTDOWN_TIMEOUT_MS).unref();
    await server.close();
    process.exit();
  };

  process.on("SIGINT", onCloseSignal);
  process.on("SIGTERM", onCloseSignal);
};

run();
