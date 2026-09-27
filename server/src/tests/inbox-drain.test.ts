import assert from "node:assert";
import { test, describe, beforeEach, mock } from "bun:test";

import { type Agent } from "@atproto/api";
import { type Logger } from "pino";

import { DRAIN_BATCH_SIZE, InboxDrain } from "../services/inbox-drain";
import { MemoryInboxStore } from "./helpers/memory-inbox-store";

const ALICE = "did:plc:alice";
const BOB = "did:plc:bob";

interface LegacyFixture {
  rkey: string;
  value: Record<string, unknown>;
}

const legacy = (rkey: string, value: Record<string, unknown> = {}): LegacyFixture => ({
  rkey,
  value: {
    $type: "app.navyfragen.message",
    message: `question ${rkey}`,
    createdAt: "2026-09-01T00:00:00.000Z",
    recipient: ALICE,
    ...value,
  },
});

const legacyBatch = (count: number) => Array.from({ length: count }, (_, i) => legacy(`anon-${i}`));

function fakeAgent(records: LegacyFixture[]) {
  const deleteRecord = mock(async (_args: { rkey: string }) => ({}));
  const agent = {
    com: {
      atproto: {
        repo: {
          listRecords: mock(async () => ({
            success: true,
            data: {
              records: records.map((r) => ({
                uri: `at://${ALICE}/app.navyfragen.message/${r.rkey}`,
                value: r.value,
              })),
              cursor: undefined,
            },
          })),
          deleteRecord,
        },
      },
    },
  };
  const deleted = () => deleteRecord.mock.calls.map(([args]) => args.rkey);
  return { agent: agent as unknown as Agent, deleteRecord, deleted };
}

describe("InboxDrain", () => {
  let target: MemoryInboxStore;
  let table: MemoryInboxStore;
  let drain: InboxDrain;

  beforeEach(() => {
    target = new MemoryInboxStore();
    table = new MemoryInboxStore();
    const logger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    } as unknown as Logger;
    drain = new InboxDrain(target, table, logger);
  });

  test("moves legacy records into the target and deletes the originals", async () => {
    const { agent, deleted } = fakeAgent([legacy("anon-1"), legacy("anon-2")]);

    const outcome = await drain.run(ALICE, agent);

    assert.deepStrictEqual([...target.rows.keys()], ["anon-1", "anon-2"]);
    assert.deepStrictEqual(deleted(), ["anon-1", "anon-2"]);
    assert.strictEqual(outcome.drained, 2);
  });

  test("files a legacy record under the draining user, whatever recipient it names", async () => {
    const { agent } = fakeAgent([legacy("anon-1", { recipient: BOB })]);

    await drain.run(ALICE, agent);

    assert.strictEqual(target.rows.get("anon-1")?.recipient, ALICE);
  });

  test("leaves a record that fails the lexicon in the PDS", async () => {
    const { agent, deleted } = fakeAgent([
      legacy("anon-1"),
      legacy("anon-long", { message: "x".repeat(501) }),
    ]);

    const outcome = await drain.run(ALICE, agent);

    assert.deepStrictEqual(outcome.skipped, ["anon-long"]);
    assert.ok(!target.rows.has("anon-long"));
    assert.deepStrictEqual(deleted(), ["anon-1"]);
  });

  test("copies the user's table rows into the target", async () => {
    table.rows.set("anon-t", {
      tid: "anon-t",
      message: "from the table",
      createdAt: "2026-09-01T00:00:00.000Z",
      recipient: ALICE,
    });
    const { agent } = fakeAgent([]);

    const outcome = await drain.run(ALICE, agent);

    assert.ok(target.rows.has("anon-t"));
    assert.strictEqual(outcome.backfilled, 1);
  });

  test("writes a question held in both the table and the PDS once, as the table has it", async () => {
    table.rows.set("anon-1", {
      tid: "anon-1",
      message: "table copy",
      createdAt: "2026-09-01T00:00:00.000Z",
      recipient: ALICE,
    });
    const { agent } = fakeAgent([legacy("anon-1")]);

    await drain.run(ALICE, agent);

    const written = target.putCalls.flat();
    assert.deepStrictEqual(
      written.map((m) => [m.tid, m.message]),
      [["anon-1", "table copy"]]
    );
  });

  test("deletes nothing when a write to the target fails", async () => {
    target.failing = true;
    const { agent, deleteRecord } = fakeAgent([legacy("anon-1")]);

    await assert.rejects(() => drain.run(ALICE, agent));

    assert.strictEqual(deleteRecord.mock.calls.length, 0);
  });

  test("reports a failed delete, and a re-run deletes what is left", async () => {
    const records = [legacy("anon-1"), legacy("anon-2")];
    const first = fakeAgent(records);
    first.deleteRecord.mockImplementationOnce(async () => {
      throw new Error("PDS down");
    });

    const firstOutcome = await drain.run(ALICE, first.agent);
    assert.deepStrictEqual(
      firstOutcome.deleteErrors.map((e) => e.rkey),
      ["anon-1"]
    );

    const retry = fakeAgent([records[0]]);
    const retryOutcome = await drain.run(ALICE, retry.agent);

    assert.deepStrictEqual(retryOutcome.deleteErrors, []);
    assert.deepStrictEqual(retry.deleted(), ["anon-1"]);
    assert.strictEqual(target.rows.size, 2);
  });

  describe("batching", () => {
    test("writes a full batch in one call", async () => {
      const { agent } = fakeAgent(legacyBatch(DRAIN_BATCH_SIZE));

      await drain.run(ALICE, agent);

      assert.strictEqual(target.putCalls.length, 1);
    });

    test("splits one over a full batch into two calls", async () => {
      const { agent } = fakeAgent(legacyBatch(DRAIN_BATCH_SIZE + 1));

      await drain.run(ALICE, agent);

      assert.deepStrictEqual(
        target.putCalls.map((batch) => batch.length),
        [DRAIN_BATCH_SIZE, 1]
      );
    });
  });
});
