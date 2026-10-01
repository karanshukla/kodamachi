import { createHash } from "node:crypto";
import { Logger } from "pino";

import { type Database } from "../database/db";
import { errorMessage } from "../lib/errors";
import { imageGenerator } from "../lib/image-generator";
import { createTtlCache, type TtlCache } from "../lib/ttl-cache";
import { readImageTheme } from "./image-theme";
import type { ProfileResolver } from "./message-service";

/** Long enough to survive a user being interrupted mid-reply. */
export const RENDER_TTL_MS = 10 * 60 * 1000;

/** Entries are PNGs of a few hundred KB; this bounds idle memory. */
const RENDER_STORE_MAX_ENTRIES = 100;

/** The image service sleeps within minutes of idle; past this a render likely pays a wake. */
const WARM_WINDOW_MS = 60_000;

const NOT_READY_MESSAGE = "The question image is still rendering.";

export type RenderStatus = "pending" | "rendering" | "ready" | "failed";

export interface RenderedQuestionImage {
  imageBlob: Buffer;
  imageAltText?: string;
  width?: number;
  height?: number;
}

/** Status and bytes share one record so a poll never sees `ready` without bytes. */
type RenderRecord = { did: string } & (
  | { status: "pending" | "rendering" }
  | { status: "ready"; image: RenderedQuestionImage }
  | { status: "failed"; error: string }
);

export interface RenderStatusReport {
  status: RenderStatus | "unknown";
  error?: string;
}

export type RenderClaim =
  | { ok: true; image: RenderedQuestionImage }
  | { ok: false; status: Exclude<RenderStatus, "ready"> | "unknown"; error?: string };

export interface EnqueueRenderInput {
  did: string;
  tid: string;
  original: string;
  theme?: string;
}

export const QUESTION_NOT_IN_INBOX = "Question not found";

/** A byte no field can contain. Written as an escape: a literal NUL makes git treat this file as binary. */
const FIELD_SEPARATOR = "\u0000";

/**
 * Content-addressed so duplicate enqueues collapse. The DID scopes a render to
 * its owner; the handle is drawn into the image, so a change must re-render.
 *
 * @see [render-service.test.ts](../tests/render-service.test.ts) — pins that
 * text shifted across a field boundary produces a different key.
 */
function renderKey(
  did: string,
  handle: string | undefined,
  theme: string,
  original: string
): string {
  return createHash("sha256")
    .update([did, handle ?? "", theme, original].join(FIELD_SEPARATOR))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Renders question images off the reply request and holds the result until the
 * user confirms the post.
 *
 * **Nothing here may reach `agent.post` or `agent.uploadBlob`**: posting stays
 * in an authenticated request, so a signed-out user never has something posted
 * on their behalf.
 *
 * The store is in-process, safe only at one replica per region; see
 * "In-process state, and the replica count that makes it safe" in
 * `server/CLAUDE.md`.
 *
 * @see [render-service.test.ts](../tests/render-service.test.ts) — pins the
 * content-addressed dedup, the TTL, that a failed render is cleared as it is
 * read, and that this module never touches an agent.
 */
export class RenderService {
  private store: TtlCache<RenderRecord>;
  private lastRenderFinishedAt = 0;

  constructor(
    private db: Database,
    private resolver: ProfileResolver,
    private logger: Logger,
    store: TtlCache<RenderRecord> = createTtlCache<RenderRecord>(RENDER_STORE_MAX_ENTRIES)
  ) {
    this.store = store;
  }

  async enqueue({
    did,
    tid,
    original,
    theme,
  }: EnqueueRenderInput): Promise<{ renderId: string; status: RenderStatus }> {
    if (!(await this.questionIsInInbox(did, tid, original))) {
      throw new Error(QUESTION_NOT_IN_INBOX);
    }
    const resolvedTheme = theme ?? (await readImageTheme(this.db, did));
    const handle = await this.resolver.resolveDidToHandle(did);
    const renderId = renderKey(did, handle, resolvedTheme, original);

    const existing = this.store.get(renderId);
    if (existing) return { renderId, status: existing.status };

    this.store.set(renderId, { did, status: "pending" }, RENDER_TTL_MS);
    this.logger.info(
      { renderId, tid, did, theme: resolvedTheme, cold: this.looksCold() },
      "Question image render enqueued"
    );
    // Next turn, so the 202 is written before the render starts.
    setImmediate(() => void this.render(renderId, did, original, resolvedTheme, handle));
    return { renderId, status: "pending" };
  }

  /**
   * A failed render is cleared as it is read so a retry re-renders. An unknown
   * key (expired, or lost to a deploy) reads as `unknown`, not `failed`.
   */
  readStatus(renderId: string, did: string): RenderStatusReport {
    const record = this.store.get(renderId);
    if (!record || record.did !== did) return { status: "unknown" };
    if (record.status === "failed") {
      this.store.take(renderId);
      return { status: "failed", error: record.error };
    }
    return { status: record.status };
  }

  /**
   * Single-use: `renderId` is content-addressed, so two tabs share one ready
   * key; the second caller gets `unknown` and cannot post the image.
   */
  claimReady(renderId: string, did: string): RenderClaim {
    const record = this.store.get(renderId);
    if (!record || record.did !== did) return { ok: false, status: "unknown" };
    if (record.status !== "ready") {
      return {
        ok: false,
        status: record.status,
        error: record.status === "failed" ? record.error : NOT_READY_MESSAGE,
      };
    }
    this.store.take(renderId);
    return { ok: true, image: record.image };
  }

  /**
   * Bounds renders by inbox size: an arbitrary `original` would be a fresh
   * Chromium render. Another inbox's question reads as not-found, so tids
   * cannot be probed.
   *
   * @see [render-service.test.ts](../tests/render-service.test.ts) — pins that
   * the caller's own question renders and that another inbox's does not.
   */
  private async questionIsInInbox(did: string, tid: string, original: string): Promise<boolean> {
    const message = await this.db
      .selectFrom("message")
      .select(["message"])
      .where("tid", "=", tid)
      .where("recipient", "=", did)
      .executeTakeFirst();
    return message?.message === original;
  }

  private looksCold(): boolean {
    return Date.now() - this.lastRenderFinishedAt > WARM_WINDOW_MS;
  }

  private async render(
    renderId: string,
    did: string,
    original: string,
    theme: string,
    handle: string | undefined
  ): Promise<void> {
    const startedAt = Date.now();
    this.store.set(renderId, { did, status: "rendering" }, RENDER_TTL_MS);
    try {
      const { imageBlob, imageAltText, width, height } = await imageGenerator.generateQuestionImage(
        original,
        this.logger,
        handle,
        theme
      );
      if (!imageBlob) {
        throw new Error(
          "Image generation failed — the image service may still be starting up. Please try again in a moment."
        );
      }
      this.store.set(
        renderId,
        { did, status: "ready", image: { imageBlob, imageAltText, width, height } },
        RENDER_TTL_MS
      );
      this.lastRenderFinishedAt = Date.now();
      this.logger.info(
        { renderId, did, durationMs: Date.now() - startedAt },
        "Question image render completed"
      );
    } catch (err) {
      this.store.set(
        renderId,
        { did, status: "failed", error: errorMessage(err) || "Image render failed" },
        RENDER_TTL_MS
      );
      this.logger.error(
        { err, renderId, did, durationMs: Date.now() - startedAt },
        "Question image render failed"
      );
    }
  }
}
