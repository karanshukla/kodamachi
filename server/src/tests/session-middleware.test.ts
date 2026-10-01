import assert from "node:assert";
import { Database as BunSqlite } from "bun:sqlite";
import { test, describe, beforeEach, afterEach } from "bun:test";

import { Hono } from "hono";
import { Kysely, SqliteDialect } from "kysely";

import { BunSqliteDatabase } from "../database/bun-sqlite-dialect";
import { migrateToLatest, type Database, type DatabaseSchema } from "../database/db";
import { sessionDid } from "../hono/route-helpers";
import { liveDidMiddleware } from "../hono/session-middleware";
import { sessionHeader, withTestSession } from "./helpers/hono-test";

const DID = "did:plc:alice";

describe("liveDidMiddleware", () => {
  let db: Database;
  let app: ReturnType<typeof withTestSession>;

  beforeEach(async () => {
    db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: new BunSqliteDatabase(new BunSqlite(":memory:")) }),
    });
    await migrateToLatest(db);
    const sub = new Hono();
    sub.use("*", liveDidMiddleware(db));
    sub.get("/whoami", (c) => c.json({ did: sessionDid(c) ?? null }));
    app = withTestSession(sub);
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function whoami(): Promise<string | null> {
    const res = await app.request("/whoami", { headers: sessionHeader({ did: DID }) });
    return ((await res.json()) as { did: string | null }).did;
  }

  test("keeps a DID whose OAuth session is stored", async () => {
    await db.insertInto("auth_session").values({ key: DID, session: "{}" }).execute();

    assert.strictEqual(await whoami(), DID);
  });

  test("drops a DID whose OAuth session is gone", async () => {
    assert.strictEqual(await whoami(), null);
  });
});
