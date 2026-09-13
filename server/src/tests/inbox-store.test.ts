import assert from "node:assert";
import { Database as BunSqlite } from "bun:sqlite";
import { test, describe, beforeEach, afterEach } from "bun:test";

import { Kysely, SqliteDialect } from "kysely";

import { BunSqliteDatabase } from "../database/bun-sqlite-dialect";
import { migrateToLatest, type Database, type DatabaseSchema } from "../database/db";
import { KyselyInboxStore, type Message } from "../services/inbox-store";

const ALICE = "did:plc:alice";
const BOB = "did:plc:bob";

const message = (tid: string, recipient: string, createdAt: string, text = tid): Message => ({
  tid,
  message: text,
  createdAt,
  recipient,
});

describe("KyselyInboxStore", () => {
  let db: Database;
  let store: KyselyInboxStore;

  beforeEach(async () => {
    db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: new BunSqliteDatabase(new BunSqlite(":memory:")) }),
    });
    await migrateToLatest(db);
    store = new KyselyInboxStore(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("lists only the recipient's messages, newest first", async () => {
    await store.putIgnoringDuplicates([
      message("a1", ALICE, "2026-09-01T00:00:00.000Z"),
      message("b1", BOB, "2026-09-02T00:00:00.000Z"),
      message("a2", ALICE, "2026-09-03T00:00:00.000Z"),
    ]);

    const tids = (await store.list(ALICE)).map((m) => m.tid);

    assert.deepStrictEqual(tids, ["a2", "a1"]);
  });

  test("finds a message by tid regardless of recipient", async () => {
    await store.putIgnoringDuplicates([message("b1", BOB, "2026-09-01T00:00:00.000Z")]);

    assert.strictEqual((await store.find("b1"))?.recipient, BOB);
  });

  test("finds nothing for an unknown tid", async () => {
    assert.strictEqual(await store.find("missing"), undefined);
  });

  test("keeps the first write when a tid is put twice", async () => {
    await store.putIgnoringDuplicates([message("a1", ALICE, "2026-09-01T00:00:00.000Z", "first")]);
    await store.putIgnoringDuplicates([message("a1", ALICE, "2026-09-01T00:00:00.000Z", "second")]);

    const stored = await store.list(ALICE);

    assert.deepStrictEqual(
      stored.map((m) => m.message),
      ["first"]
    );
  });

  test("removes only the given tid", async () => {
    await store.putIgnoringDuplicates([
      message("a1", ALICE, "2026-09-01T00:00:00.000Z"),
      message("a2", ALICE, "2026-09-02T00:00:00.000Z"),
    ]);

    await store.remove("a1");

    assert.deepStrictEqual(
      (await store.list(ALICE)).map((m) => m.tid),
      ["a2"]
    );
  });

  test("clears one recipient's inbox without touching another's", async () => {
    await store.putIgnoringDuplicates([
      message("a1", ALICE, "2026-09-01T00:00:00.000Z"),
      message("b1", BOB, "2026-09-02T00:00:00.000Z"),
    ]);

    await store.clear(ALICE);

    assert.deepStrictEqual(await store.list(ALICE), []);
    assert.deepStrictEqual(
      (await store.list(BOB)).map((m) => m.tid),
      ["b1"]
    );
  });
});
