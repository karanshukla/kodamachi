import type { Agent } from "@atproto/api";
import type { Logger } from "pino";

import { ids } from "../lexicon/lexicons";
import { type Record as LegacyRecord } from "../lexicon/types/app/navyfragen/message";
import { withRetry } from "./retry";

/** What `com.atproto.repo.listRecords` accepts as its per-page maximum. */
const PDS_PAGE_SIZE = 100;

export interface LegacyRecordEntry {
  rkey: string;
  value: LegacyRecord;
}

/**
 * Every `app.navyfragen.message` record in the user's own repo. Values are
 * whatever the repo holds: validate before trusting them.
 */
export async function listLegacyRecords(
  userDid: string,
  agent: Agent,
  logger: Logger
): Promise<LegacyRecordEntry[]> {
  const records: LegacyRecordEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await withRetry(
      () =>
        agent.com.atproto.repo.listRecords({
          repo: userDid,
          collection: ids.AppNavyfragenMessage,
          limit: PDS_PAGE_SIZE,
          cursor,
        }),
      logger,
      { did: userDid, op: "listRecords" }
    );
    if (!page.success) break;
    for (const record of page.data.records) {
      const rkey = record.uri.split("/").pop()!;
      records.push({ rkey, value: record.value as LegacyRecord });
    }
    cursor = page.data.cursor;
  } while (cursor);
  return records;
}
