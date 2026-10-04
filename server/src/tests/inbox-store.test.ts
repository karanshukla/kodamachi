import assert from "node:assert";
import { Database as BunSqlite } from "bun:sqlite";
import { test, describe, beforeEach, afterEach } from "bun:test";

import { Kysely, SqliteDialect } from "kysely";

import { BunSqliteDatabase } from "../database/bun-sqlite-dialect";
import { migrateToLatest, type Database, type DatabaseSchema } from "../database/db";
import { KyselyInboxStore, type Question } from "../services/inbox-store";

const ALICE = "did:plc:alice";
const BOB = "did:plc:bob";

const question = (tid: string, createdAt: string, text = tid): Question => ({
  tid,
  message: text,
  createdAt,
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
    await store.putIgnoringDuplicates(ALICE, [
      question("a1", "2026-09-01T00:00:00.000Z"),
      question("a2", "2026-09-03T00:00:00.000Z"),
    ]);
    await store.putIgnoringDuplicates(BOB, [question("b1", "2026-09-02T00:00:00.000Z")]);

    const tids = (await store.list(ALICE)).map((m) => m.tid);

    assert.deepStrictEqual(tids, ["a2", "a1"]);
  });

  test("files a put question under the recipient it was put for", async () => {
    await store.putIgnoringDuplicates(BOB, [question("b1", "2026-09-01T00:00:00.000Z")]);

    assert.strictEqual((await store.find(BOB, "b1"))?.recipient, BOB);
  });

  test("finds nothing for another recipient's tid", async () => {
    await store.putIgnoringDuplicates(BOB, [question("b1", "2026-09-01T00:00:00.000Z")]);

    assert.strictEqual(await store.find(ALICE, "b1"), undefined);
  });

  test("finds nothing for an unknown tid", async () => {
    assert.strictEqual(await store.find(ALICE, "missing"), undefined);
  });

  test("keeps the first write when a tid is put twice", async () => {
    await store.putIgnoringDuplicates(ALICE, [question("a1", "2026-09-01T00:00:00.000Z", "first")]);
    await store.putIgnoringDuplicates(ALICE, [
      question("a1", "2026-09-01T00:00:00.000Z", "second"),
    ]);

    const stored = await store.list(ALICE);

    assert.deepStrictEqual(
      stored.map((m) => m.message),
      ["first"]
    );
  });

  test("removes only the given tid", async () => {
    await store.putIgnoringDuplicates(ALICE, [
      question("a1", "2026-09-01T00:00:00.000Z"),
      question("a2", "2026-09-02T00:00:00.000Z"),
    ]);

    await store.remove(ALICE, "a1");

    assert.deepStrictEqual(
      (await store.list(ALICE)).map((m) => m.tid),
      ["a2"]
    );
  });

  test("leaves another recipient's question in place", async () => {
    await store.putIgnoringDuplicates(BOB, [question("b1", "2026-09-01T00:00:00.000Z")]);

    await store.remove(ALICE, "b1");

    assert.deepStrictEqual(
      (await store.list(BOB)).map((m) => m.tid),
      ["b1"]
    );
  });

  test("clears one recipient's inbox without touching another's", async () => {
    await store.putIgnoringDuplicates(ALICE, [question("a1", "2026-09-01T00:00:00.000Z")]);
    await store.putIgnoringDuplicates(BOB, [question("b1", "2026-09-02T00:00:00.000Z")]);

    await store.clear(ALICE);

    assert.deepStrictEqual(await store.list(ALICE), []);
    assert.deepStrictEqual(
      (await store.list(BOB)).map((m) => m.tid),
      ["b1"]
    );
  });
});
