/* v8 ignore start */
import { AppBskyEmbedImages, AppBskyFeedPost, RichText, Agent } from "@atproto/api";
import { Logger } from "pino";

import { type Database } from "../database/db";
import { errorMessage } from "../lib/errors";
import { getServerMessages } from "../lib/i18n";
import { findProfanity } from "../lib/profanity";
import type { ProfanityMatch } from "../lib/profanity";
import { listLegacyRecords } from "../lib/legacy-records";
import { withRetry } from "../lib/retry";
import { ids } from "../lexicon/lexicons";
import { type Record as MessageSchemaRecord } from "../lexicon/types/app/navyfragen/message";
import { imageGenerator } from "../lib/image-generator";
import { readImageTheme } from "./image-theme";
import { KyselyInboxStore, type InboxStore, type Message } from "./inbox-store";
import type { RenderedQuestionImage } from "./render-service";

export type { Message } from "./inbox-store";

export interface ProfileResolver {
  resolveDidToHandle(did: string): Promise<string | undefined>;
}

interface SyncOutcome {
  count: number;
  errors: { tid: string; error: string }[];
}

/**
 * The `sendMessage`/`deleteMessage` rejections a route maps to a specific
 * status and error code. Named constants rather than prose compared with
 * `String.includes`, mirroring `render-service.ts`'s `QUESTION_NOT_IN_INBOX`:
 * an equality check against one of these is what lets the route answer with a
 * machine code instead of echoing the exception's text to the caller.
 *
 * @see [message-controller.test.ts](../tests/message-controller.test.ts) —
 * one test per sentinel, pinning the status and code it maps to.
 */
export const RECIPIENT_NOT_FOUND = "Recipient not found (user profile does not exist)";
export const INBOX_CLOSED = "This inbox is closed and not accepting new messages";
export const MESSAGE_NOT_FOUND = "Message not found";
export const NOT_AUTHORIZED_TO_DELETE = "Not authorized to delete this message";

export class MessageService {
  constructor(
    private db: Database,
    private resolver: ProfileResolver,
    private logger: Logger,
    private inbox: InboxStore = new KyselyInboxStore(db)
  ) {}
  /* v8 ignore stop */

  private async userProfileExists(did: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("user_profile")
      .select("did")
      .where("did", "=", did)
      .executeTakeFirst();
    return Boolean(row);
  }

  private async readIntakeSettings(recipient: string) {
    return await this.db
      .selectFrom("user_settings")
      .select(["inboxEnabled", "profanityFilterEnabled"])
      .where("did", "=", recipient)
      .executeTakeFirst();
  }

  async getMessages(recipient: string): Promise<Message[]> {
    try {
      if (!(await this.userProfileExists(recipient))) {
        throw new Error("User profile does not exist");
      }
      return await this.inbox.list(recipient);
    } catch (err) {
      this.logger.error({ err, recipient }, "Failed to fetch messages");
      throw new Error("Failed to fetch messages", { cause: err });
    }
  }

  /**
   * Seeded once, in the requesting user's `uiLocale` at that moment. These are
   * content, not chrome: never retranslated on a later read, never re-seeded
   * on a later locale change.
   * @see [message-service.test.ts](../tests/message-service.test.ts) — "keeps
   * a message seeded under one locale after the owner switches uiLocale".
   */
  async addExampleMessages(recipient: string, uiLocale?: string | null): Promise<Message[]> {
    try {
      const now = new Date();
      const exampleQuestions = getServerMessages(uiLocale).exampleQuestions;
      const examples = exampleQuestions.map((message, i) => ({
        tid: `example-${i + 1}-${Date.now()}`,
        message,
        createdAt: new Date(now.getTime() + i * 1000).toISOString(),
        recipient,
      }));

      await this.inbox.putIgnoringDuplicates(examples);

      return await this.getMessages(recipient);
    } catch (err) {
      this.logger.error({ err, recipient }, "Failed to add example messages");
      throw new Error("Failed to add example messages", { cause: err });
    }
  }

  async sendMessage(recipient: string, message: string): Promise<{ success: boolean }> {
    try {
      if (!(await this.userProfileExists(recipient))) {
        throw new Error(RECIPIENT_NOT_FOUND);
      }

      const intakeSettings = await this.readIntakeSettings(recipient);

      if (intakeSettings && !intakeSettings.inboxEnabled) {
        throw new Error(INBOX_CLOSED);
      }

      const flagged = intakeSettings?.profanityFilterEnabled ? findProfanity(message) : null;
      if (flagged) {
        return this.dropWithoutTellingSender(recipient, flagged);
      }

      const tid = `anon-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      await this.inbox.putIgnoringDuplicates([
        { tid, message, createdAt: new Date().toISOString(), recipient },
      ]);

      this.logger.debug({ recipient, tid }, "Message saved to DB");
      return { success: true };
    } catch (err) {
      this.logger.error({ err, recipient }, "Failed to send message");
      throw new Error(errorMessage(err) || "Failed to send message", { cause: err });
    }
  }

  /**
   * @see [message-service.test.ts](../tests/message-service.test.ts) — pins that
   * a flagged message still answers success and is never inserted, so a sender
   * cannot probe the filter.
   */
  private dropWithoutTellingSender(
    recipient: string,
    flagged: ProfanityMatch
  ): { success: boolean } {
    this.logger.info(
      { recipient, flaggedWord: flagged.word, flaggedLanguage: flagged.language },
      "Message silently dropped (profanity filter)"
    );
    return { success: true };
  }

  async deleteMessage(tid: string, userDid: string, agent: Agent): Promise<{ success: boolean }> {
    try {
      const message = await this.inbox.find(tid);

      if (!message) {
        throw new Error(MESSAGE_NOT_FOUND);
      }

      if (message.recipient !== userDid) {
        throw new Error(NOT_AUTHORIZED_TO_DELETE);
      }

      await this.inbox.remove(tid);
      this.deletePdsRecordInBackground(tid, userDid, agent);

      return { success: true };
    } catch (err) {
      this.logger.error({ err, tid, userDid }, "Failed to delete message");
      throw new Error(errorMessage(err) || "Failed to delete message", { cause: err });
    }
  }

  private deletePdsRecordInBackground(tid: string, userDid: string, agent: Agent): void {
    agent.com.atproto.repo
      .deleteRecord({
        repo: userDid,
        collection: ids.AppNavyfragenMessage,
        rkey: tid,
      })
      .catch((err) => {
        this.logger.error({ err, tid }, "Background PDS delete failed");
      });
  }

  private async toRichTextFields(text: string, agent: Agent) {
    const richText = new RichText({ text });
    await richText.detectFacets(agent);
    return { text: richText.text, facets: richText.facets || [] };
  }

  private async resolveReplyReference(
    replyTo: { uri: string },
    agent: Agent
  ): Promise<AppBskyFeedPost.Record["reply"]> {
    const uriParts = replyTo.uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!uriParts) throw new Error("Invalid parent post URI");
    const [, repo, collection, rkey] = uriParts;
    const parentRecord = await withRetry(
      () => agent.com.atproto.repo.getRecord({ repo, collection, rkey }),
      this.logger,
      { repo, collection, rkey, op: "getRecord" }
    );
    if (!parentRecord.data.cid) throw new Error("Could not resolve CID for parent post");
    return {
      root: { uri: replyTo.uri, cid: parentRecord.data.cid },
      parent: { uri: replyTo.uri, cid: parentRecord.data.cid },
    };
  }

  private async renderQuestionImage(
    question: string,
    did: string,
    handle: string | undefined
  ): Promise<RenderedQuestionImage> {
    const theme = await readImageTheme(this.db, did);
    const { imageBlob, imageAltText, width, height } = await imageGenerator.generateQuestionImage(
      question,
      this.logger,
      handle,
      theme
    );

    if (!imageBlob) {
      throw new Error(
        "Image generation failed — the image service may still be starting up. Please try again in a moment."
      );
    }
    return { imageBlob, imageAltText, width, height };
  }

  private async buildQuestionImageEmbed(
    image: RenderedQuestionImage,
    agent: Agent
  ): Promise<AppBskyFeedPost.Record["embed"]> {
    const uploadedImage = await agent.uploadBlob(image.imageBlob, { encoding: "image/png" });
    const imageEmbed: AppBskyEmbedImages.Image = {
      image: uploadedImage.data.blob,
      alt: image.imageAltText || "Image of the anonymous question",
    };
    if (image.width && image.height) {
      imageEmbed.aspectRatio = { width: image.width, height: image.height };
    }
    return { $type: "app.bsky.embed.images", images: [imageEmbed] };
  }

  async warmImageService(): Promise<void> {
    await imageGenerator.warmImageService(this.logger);
  }

  private async resolveBskyWebUrl(postUri: string, agent: Agent): Promise<string | undefined> {
    const match = postUri.match(/^at:\/\/(.+?)\/app\.bsky\.feed\.post\/(.+)$/);
    if (!match) return undefined;

    const [, authorDid, rkey] = match;
    const profileHandle = await agent.app.bsky.actor
      .getProfile({ actor: authorDid })
      .then((res) => res?.data?.handle)
      .catch(() => undefined);

    return `https://bsky.app/profile/${profileHandle || authorDid}/post/${encodeURIComponent(rkey)}`;
  }

  async respondToMessage(
    tid: string,
    did: string,
    recipient: string,
    original: string,
    response: string,
    includeQuestionAsImage: boolean,
    agent: Agent,
    replyTo?: { uri: string; cid?: string },
    /**
     * A render the async pipeline already produced and the caller has claimed.
     * When present the image service is never called: the bytes are uploaded
     * and posted inside this authenticated request, which is the only place
     * `agent.post` ever runs.
     */
    preRendered?: RenderedQuestionImage
  ): Promise<{ success: boolean; uri: string; cid: string; link?: string }> {
    try {
      const handle = await this.resolver.resolveDidToHandle(did);

      const postRecord: Partial<AppBskyFeedPost.Record> = {
        ...(await this.toRichTextFields(response, agent)),
        createdAt: new Date().toISOString(),
      };

      if (replyTo) {
        postRecord.reply = await this.resolveReplyReference(replyTo, agent);
      }

      if (includeQuestionAsImage) {
        const image = preRendered ?? (await this.renderQuestionImage(original, did, handle));
        postRecord.embed = await this.buildQuestionImageEmbed(image, agent);
      } else {
        Object.assign(
          postRecord,
          await this.toRichTextFields(`${response}\n\nAnon asked via 🔷💬📩: "${original}"`, agent)
        );
      }

      const posted = await agent.post(postRecord);
      this.logger.debug({ tid, did, uri: posted.uri }, "Response posted to Bluesky");

      return {
        success: true,
        uri: posted.uri,
        cid: posted.cid,
        link: await this.resolveBskyWebUrl(posted.uri, agent),
      };
    } catch (err) {
      this.logger.error({ err, tid, did }, "Error while trying to post response to Bluesky");
      throw new Error(errorMessage(err) || "Failed to post to Bluesky", { cause: err });
    }
  }

  private async deleteAllPdsMessages(userDid: string, agent: Agent): Promise<void> {
    try {
      const messageRows = await this.inbox.list(userDid);

      if (messageRows.length === 0) {
        this.logger.info({ did: userDid }, "No messages found for deletion in PDS");
      }

      for (const { tid } of messageRows) {
        await agent.com.atproto.repo.deleteRecord({
          repo: userDid,
          collection: ids.AppNavyfragenMessage,
          rkey: tid,
        });
      }

      this.logger.info({ did: userDid }, "Successfully deleted all messages from PDS");
    } catch (err) {
      this.logger.error({ err, did: userDid }, "Failed to delete messages from PDS");
      throw new Error("Failed to delete messages from PDS, but data deleted in the DB", {
        cause: err,
      });
    }
  }

  private async deleteProfileAndSettingsAtomically(userDid: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("user_profile").where("did", "=", userDid).execute();
      await trx.deleteFrom("user_settings").where("did", "=", userDid).execute();
    });
  }

  /**
   * The inbox is cleared before the profile goes, so a failure part-way leaves
   * an account that can retry deletion rather than questions with no owner.
   * @see [message-service.test.ts](../tests/message-service.test.ts) — "deleteUserData
   * clears the inbox before the profile" and "deleteUserData keeps the profile
   * when clearing the inbox fails".
   */
  async deleteUserData(userDid: string, agent: Agent): Promise<{ success: boolean }> {
    try {
      // PDS deletion runs before (and outside) the transaction so network calls
      // never hold a DB connection open.
      await this.deleteAllPdsMessages(userDid, agent);
      await this.inbox.clear(userDid);
      await this.deleteProfileAndSettingsAtomically(userDid);

      return { success: true };
    } catch (err) {
      this.logger.error({ err, did: userDid }, "Failed to delete user data");
      throw new Error("Failed to delete user data", { cause: err });
    }
  }

  private async pushMissingToPds(
    localMessages: Message[],
    pdsRecords: { rkey: string }[],
    agent: Agent
  ): Promise<SyncOutcome> {
    const pdsRkeys = new Set(pdsRecords.map((r) => r.rkey));
    const outcome: SyncOutcome = { count: 0, errors: [] };

    for (const dbMessage of localMessages) {
      if (pdsRkeys.has(dbMessage.tid)) continue;

      try {
        await agent.com.atproto.repo.createRecord({
          repo: agent.assertDid,
          collection: ids.AppNavyfragenMessage,
          rkey: dbMessage.tid,
          record: {
            $type: ids.AppNavyfragenMessage,
            createdAt: dbMessage.createdAt,
            message: dbMessage.message,
            recipient: dbMessage.recipient,
          } satisfies MessageSchemaRecord,
        });
        outcome.count++;
      } catch (err: unknown) {
        outcome.errors.push({
          tid: dbMessage.tid,
          error: errorMessage(err) || "Unknown error during PDS record creation",
        });
      }
    }
    return outcome;
  }

  /**
   * Anyone can write any record into their own repo, so an imported record is
   * filed under the user syncing it, never under the recipient it names.
   * @see [message-service.test.ts](../tests/message-service.test.ts) — "syncMessages
   * files a record naming another recipient under the syncing user".
   */
  private async importMissingFromPds(
    userDid: string,
    pdsRecords: { rkey: string; value: MessageSchemaRecord }[],
    localMessages: Message[]
  ): Promise<SyncOutcome> {
    const localTids = new Set(localMessages.map((m) => m.tid));
    const outcome: SyncOutcome = { count: 0, errors: [] };

    for (const pdsRecord of pdsRecords) {
      if (localTids.has(pdsRecord.rkey)) continue;

      try {
        await this.inbox.putIgnoringDuplicates([
          {
            tid: pdsRecord.rkey,
            message: pdsRecord.value.message,
            createdAt: pdsRecord.value.createdAt,
            recipient: userDid,
          },
        ]);
        outcome.count++;
      } catch (err: unknown) {
        outcome.errors.push({
          tid: pdsRecord.rkey,
          error: errorMessage(err) || "Unknown error during DB import",
        });
      }
    }
    return outcome;
  }

  async syncMessages(
    userDid: string,
    agent: Agent
  ): Promise<{
    success: boolean;
    message?: string;
    syncedCount?: number;
    importedCount?: number;
    errorCount?: number;
    errors?: { tid: string; error: string }[];
  }> {
    try {
      const pdsRecords = await listLegacyRecords(userDid, agent, this.logger);
      const localMessages = await this.inbox.list(userDid);

      const pushOutcome = await this.pushMissingToPds(localMessages, pdsRecords, agent);
      const importOutcome = await this.importMissingFromPds(userDid, pdsRecords, localMessages);

      const syncedCount = pushOutcome.count;
      const importedCount = importOutcome.count;
      const syncErrors = [...pushOutcome.errors, ...importOutcome.errors];
      const errorCount = syncErrors.length;

      this.logger.info(
        { did: userDid, syncedCount, importedCount, errorCount },
        "Bidirectional PDS sync completed"
      );

      return {
        success: true,
        syncedCount,
        importedCount,
        errorCount,
        errors: syncErrors,
      };
    } catch (err: unknown) {
      this.logger.error({ err, did: userDid }, "Error during message sync process");
      throw new Error("Failed to sync messages to PDS", { cause: err });
    }
  }
  /* v8 ignore next 1 */
}
