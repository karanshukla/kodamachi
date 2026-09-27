import type { Agent } from "@atproto/api";
import type { Logger } from "pino";

import { errorMessage } from "../lib/errors";
import { listLegacyRecords, type LegacyRecordEntry } from "../lib/legacy-records";
import { ids } from "../lexicon/lexicons";
import { validateRecord } from "../lexicon/types/app/navyfragen/message";
import type { InboxStore, Message } from "./inbox-store";

/**
 * @see [inbox-drain.test.ts](../tests/inbox-drain.test.ts) — "writes a full
 * batch in one call" and "splits one over a full batch into two calls".
 */
export const DRAIN_BATCH_SIZE = 100;

export interface DrainOutcome {
  backfilled: number;
  drained: number;
  skipped: string[];
  deleteErrors: { rkey: string; error: string }[];
}

/**
 * Anyone can write any record into their own repo, so the recipient a legacy
 * record names is never trusted.
 * @see [inbox-drain.test.ts](../tests/inbox-drain.test.ts) — "files a legacy
 * record under the draining user, whatever recipient it names".
 */
function ownedBy(userDid: string, record: LegacyRecordEntry): Message {
  return {
    tid: record.rkey,
    message: record.value.message,
    createdAt: record.value.createdAt,
    recipient: userDid,
  };
}

function firstPerTid(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return messages.filter((m) => !seen.has(m.tid) && seen.add(m.tid));
}

/**
 * Moves a user's inbox into `target` at login: their table rows, plus the
 * legacy records sync left in their PDS. Originals are deleted only after every
 * write has landed, and `tid` is the key throughout, so a failed run is safe to
 * repeat on the next login.
 * @see [inbox-drain.test.ts](../tests/inbox-drain.test.ts)
 */
export class InboxDrain {
  constructor(
    private target: InboxStore,
    private table: InboxStore,
    private logger: Logger
  ) {}

  async run(userDid: string, agent: Agent): Promise<DrainOutcome> {
    const legacy = await listLegacyRecords(userDid, agent, this.logger);
    const valid = legacy.filter((r) => validateRecord(r.value).success);
    const skipped = legacy.filter((r) => !valid.includes(r)).map((r) => r.rkey);
    const fromTable = await this.table.list(userDid);

    await this.writeInBatches(
      firstPerTid([...fromTable, ...valid.map((r) => ownedBy(userDid, r))])
    );
    const deleteErrors = await this.deleteOriginals(valid, userDid, agent);

    this.logger.info(
      {
        did: userDid,
        backfilled: fromTable.length,
        drained: valid.length,
        skipped: skipped.length,
        deleteErrors: deleteErrors.length,
      },
      "Inbox drain completed"
    );
    return { backfilled: fromTable.length, drained: valid.length, skipped, deleteErrors };
  }

  private async writeInBatches(messages: Message[]): Promise<void> {
    for (let i = 0; i < messages.length; i += DRAIN_BATCH_SIZE) {
      await this.target.putIgnoringDuplicates(messages.slice(i, i + DRAIN_BATCH_SIZE));
    }
  }

  private async deleteOriginals(
    records: LegacyRecordEntry[],
    userDid: string,
    agent: Agent
  ): Promise<DrainOutcome["deleteErrors"]> {
    const errors: DrainOutcome["deleteErrors"] = [];
    for (const { rkey } of records) {
      try {
        await agent.com.atproto.repo.deleteRecord({
          repo: userDid,
          collection: ids.AppNavyfragenMessage,
          rkey,
        });
      } catch (err) {
        errors.push({ rkey, error: errorMessage(err) || "Unknown error during PDS delete" });
      }
    }
    return errors;
  }
}
