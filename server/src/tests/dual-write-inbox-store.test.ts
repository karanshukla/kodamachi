import assert from "node:assert";
import { test, describe, beforeEach, mock } from "bun:test";

import { type Logger } from "pino";

import { DualWriteInboxStore } from "../services/dual-write-inbox-store";
import type { Message } from "../services/inbox-store";
import { MemoryInboxStore } from "./helpers/memory-inbox-store";

const ALICE = "did:plc:alice";

const question = (tid: string): Message => ({
  tid,
  message: tid,
  createdAt: "2026-09-13T00:00:00.000Z",
  recipient: ALICE,
});

describe("DualWriteInboxStore", () => {
  let table: MemoryInboxStore;
  let space: MemoryInboxStore;
  let logger: Logger;
  let store: DualWriteInboxStore;

  beforeEach(() => {
    table = new MemoryInboxStore();
    space = new MemoryInboxStore();
    logger = { warn: mock(() => {}) } as unknown as Logger;
    store = new DualWriteInboxStore(table, space, logger);
  });

  describe("writes", () => {
    test("writes a question to both the table and the space", async () => {
      await store.putIgnoringDuplicates([question("q1")]);

      assert.ok(table.rows.has("q1"));
      assert.ok(space.rows.has("q1"));
    });

    test("fails when the space write fails, keeping the question in the table", async () => {
      space.failing = true;

      await assert.rejects(() => store.putIgnoringDuplicates([question("q1")]));

      assert.ok(table.rows.has("q1"));
    });

    test("fails without touching the space when the table write fails", async () => {
      table.failing = true;

      await assert.rejects(() => store.putIgnoringDuplicates([question("q1")]));

      assert.strictEqual(space.rows.size, 0);
    });
  });

  describe("reads", () => {
    test("lists from the space when it answers", async () => {
      space.rows.set("q1", question("q1"));
      table.rows.set("q2", question("q2"));

      const tids = (await store.list(ALICE)).map((m) => m.tid);

      assert.deepStrictEqual(tids, ["q1"]);
    });

    test("lists from the table when the space read fails, and logs the fallback", async () => {
      space.failing = true;
      table.rows.set("q2", question("q2"));

      const tids = (await store.list(ALICE)).map((m) => m.tid);

      assert.deepStrictEqual(tids, ["q2"]);
      assert.strictEqual((logger.warn as ReturnType<typeof mock>).mock.calls.length, 1);
    });

    test("finds in the space when it answers", async () => {
      space.rows.set("q1", question("q1"));

      assert.strictEqual((await store.find("q1"))?.tid, "q1");
    });

    test("finds in the table when the space lookup fails", async () => {
      space.failing = true;
      table.rows.set("q1", question("q1"));

      assert.strictEqual((await store.find("q1"))?.tid, "q1");
    });
  });

  describe("removes", () => {
    beforeEach(() => {
      table.rows.set("q1", question("q1"));
      space.rows.set("q1", question("q1"));
    });

    test("removes a question from both", async () => {
      await store.remove("q1");

      assert.strictEqual(table.rows.size + space.rows.size, 0);
    });

    test("fails without touching the table when the space remove fails", async () => {
      space.failing = true;

      await assert.rejects(() => store.remove("q1"));

      assert.ok(table.rows.has("q1"));
    });

    test("keeps the question in the table when the table remove fails", async () => {
      table.failing = true;

      await assert.rejects(() => store.remove("q1"));

      assert.ok(table.rows.has("q1"));
      assert.strictEqual(space.rows.size, 0);
    });
  });

  describe("clears", () => {
    beforeEach(() => {
      table.rows.set("q1", question("q1"));
      space.rows.set("q1", question("q1"));
    });

    test("clears the inbox in both", async () => {
      await store.clear(ALICE);

      assert.strictEqual(table.rows.size + space.rows.size, 0);
    });

    test("fails without touching the table when the space clear fails", async () => {
      space.failing = true;

      await assert.rejects(() => store.clear(ALICE));

      assert.ok(table.rows.has("q1"));
    });

    test("keeps the inbox in the table when the table clear fails", async () => {
      table.failing = true;

      await assert.rejects(() => store.clear(ALICE));

      assert.ok(table.rows.has("q1"));
      assert.strictEqual(space.rows.size, 0);
    });
  });
});
