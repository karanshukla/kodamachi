import assert from "node:assert";
import { Database as BunSqlite } from "bun:sqlite";
import { test, describe, beforeEach, afterEach } from "bun:test";

import { Kysely, SqliteDialect } from "kysely";

import { BunSqliteDatabase } from "../database/bun-sqlite-dialect";
import { migrateToLatest, type Database, type DatabaseSchema } from "../database/db";
import { KyselyDrainMarker } from "../services/inbox-drain-marker";

describe("KyselyDrainMarker", () => {
  let db: Database;
  let marker: KyselyDrainMarker;

  beforeEach(async () => {
    db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: new BunSqliteDatabase(new BunSqlite(":memory:")) }),
    });
    await migrateToLatest(db);
    marker = new KyselyDrainMarker(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("reports a marked user as drained", async () => {
    await marker.markDrained("did:plc:alice");

    assert.ok(await marker.isDrained("did:plc:alice"));
  });

  test("reports an unmarked user as not drained", async () => {
    await marker.markDrained("did:plc:alice");

    assert.ok(!(await marker.isDrained("did:plc:bob")));
  });

  test("marking a user twice is harmless", async () => {
    await marker.markDrained("did:plc:alice");
    await marker.markDrained("did:plc:alice");

    assert.ok(await marker.isDrained("did:plc:alice"));
  });
});
