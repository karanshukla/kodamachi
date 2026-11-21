import assert from "node:assert";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";

// web-push is CJS: import the default and destructure (ESM can't detect its named exports).
import webPush from "web-push";
const { generateVAPIDKeys } = webPush;

import { NotificationService, createConcurrencyLimiter } from "../services/notification-service";

function makeSelectBuilder(existing: any, rows: any[]) {
  return {
    select: mock(function (this: any) {
      return this;
    }),
    selectAll: mock(function (this: any) {
      return this;
    }),
    where: mock(function (this: any) {
      return this;
    }),
    executeTakeFirst: mock(async () => existing),
    execute: mock(async () => rows),
  };
}

function makeInsertBuilder() {
  // Kysely calls columns/doUpdateSet on the OnConflictBuilder passed into the onConflict callback; the mock captures it.
  const builder: any = {
    values: mock(function (this: any) {
      return this;
    }),
    onConflict: mock(function (this: any, cb: any) {
      const oc = {
        columns: mock(function (this: any) {
          return this;
        }),
        doUpdateSet: mock(function (this: any) {
          return builder;
        }),
      };
      if (typeof cb === "function") cb(oc);
      builder._lastOnConflict = oc;
      return this;
    }),
    execute: mock(async () => ({})),
  };
  return builder;
}

function makeDeleteBuilder() {
  return {
    where: mock(function (this: any) {
      return this;
    }),
    execute: mock(async () => ({})),
  };
}

function makeUpdateBuilder() {
  return {
    set: mock(function (this: any) {
      return this;
    }),
    where: mock(function (this: any) {
      return this;
    }),
    execute: mock(async () => ({})),
  };
}

// Valid-shaped throwaway keypair so web-push encryption succeeds and the request reaches the network.
function makeSubscriptionKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
  };
}

describe("NotificationService", () => {
  let mockDb: any;
  let mockLogger: any;
  let mockResolver: any;
  let service: NotificationService;

  beforeEach(() => {
    mockLogger = {
      info: mock(),
      error: mock(),
      warn: mock(),
      debug: mock(),
    };
    mockResolver = {
      resolveDidToHandle: mock(async () => "alice.test"),
    };
    mockDb = {
      selectFrom: mock(() => makeSelectBuilder(undefined, [])),
      insertInto: mock(() => makeInsertBuilder()),
      deleteFrom: mock(() => makeDeleteBuilder()),
      updateTable: mock(() => makeUpdateBuilder()),
    };
    service = new NotificationService(mockDb, mockResolver, mockLogger);
  });

  describe("saveSubscription", () => {
    test("upserts a subscription via a single insert + onConflict doUpdateSet", async () => {
      const insertBuilder = makeInsertBuilder();
      mockDb.insertInto = mock(() => insertBuilder);

      await service.saveSubscription("did:foo", "https://push.example/sub", "p256", "auth");

      assert.strictEqual(mockDb.insertInto.mock.calls.length, 1);
      assert.strictEqual(mockDb.updateTable.mock.calls.length, 0);
      assert.strictEqual(mockDb.selectFrom.mock.calls.length, 0);

      const valuesArg = insertBuilder.values.mock.calls[0][0];
      assert.strictEqual(valuesArg.did, "did:foo");
      assert.strictEqual(valuesArg.endpoint, "https://push.example/sub");
      assert.strictEqual(valuesArg.p256dh, "p256");
      assert.strictEqual(valuesArg.auth, "auth");

      const oc = (insertBuilder as any)._lastOnConflict;
      assert.ok(oc, "onConflict callback was not invoked");
      const conflictColumnsArg = oc.columns.mock.calls[0][0];
      assert.deepStrictEqual(conflictColumnsArg, ["did", "endpoint"]);
      const updateArg = oc.doUpdateSet.mock.calls[0][0];
      assert.strictEqual(updateArg.p256dh, "p256");
      assert.strictEqual(updateArg.auth, "auth");
    });
  });

  describe("syncSubscriptionsAcrossAccounts", () => {
    test("no-ops when fewer than two accounts are given", async () => {
      await service.syncSubscriptionsAcrossAccounts(["did:foo"]);
      assert.strictEqual(mockDb.selectFrom.mock.calls.length, 0);
    });

    test("no-ops when none of the accounts have an existing subscription", async () => {
      mockDb.selectFrom = mock(() => makeSelectBuilder(undefined, []));
      await service.syncSubscriptionsAcrossAccounts(["did:foo", "did:bar"]);
      assert.strictEqual(mockDb.insertInto.mock.calls.length, 0);
    });

    test("copies an existing device subscription to accounts still missing one", async () => {
      const rows = [
        { did: "did:foo", endpoint: "https://push.example/dev", p256dh: "p256", auth: "auth" },
      ];
      mockDb.selectFrom = mock(() => makeSelectBuilder(undefined, rows));
      const insertBuilder = makeInsertBuilder();
      mockDb.insertInto = mock(() => insertBuilder);

      await service.syncSubscriptionsAcrossAccounts(["did:foo", "did:bar"]);

      assert.strictEqual(mockDb.insertInto.mock.calls.length, 1);
      const valuesArg = insertBuilder.values.mock.calls[0][0];
      assert.strictEqual(valuesArg.did, "did:bar");
      assert.strictEqual(valuesArg.endpoint, "https://push.example/dev");
      assert.strictEqual(valuesArg.p256dh, "p256");
    });

    test("does not duplicate a row that already exists for that account", async () => {
      const rows = [
        { did: "did:foo", endpoint: "https://push.example/dev", p256dh: "p256", auth: "auth" },
        { did: "did:bar", endpoint: "https://push.example/dev", p256dh: "p256", auth: "auth" },
      ];
      mockDb.selectFrom = mock(() => makeSelectBuilder(undefined, rows));
      const insertBuilder = makeInsertBuilder();
      mockDb.insertInto = mock(() => insertBuilder);

      await service.syncSubscriptionsAcrossAccounts(["did:foo", "did:bar"]);

      assert.strictEqual(mockDb.insertInto.mock.calls.length, 0);
    });
  });

  describe("deleteSubscription", () => {
    test("deletes from push_subscription by did + endpoint", async () => {
      const deleteBuilder = makeDeleteBuilder();
      mockDb.deleteFrom = mock(() => deleteBuilder);

      await service.deleteSubscription("did:foo", "https://push.example/sub");

      assert.strictEqual(mockDb.deleteFrom.mock.calls.length, 1);
      assert.strictEqual(deleteBuilder.where.mock.calls.length, 2);
    });
  });

  describe("deleteAllSubscriptionsForUser", () => {
    test("deletes all subscriptions for a did", async () => {
      const deleteBuilder = makeDeleteBuilder();
      mockDb.deleteFrom = mock(() => deleteBuilder);

      await service.deleteAllSubscriptionsForUser("did:foo");

      assert.strictEqual(mockDb.deleteFrom.mock.calls.length, 1);
      assert.strictEqual(deleteBuilder.where.mock.calls.length, 1);
    });
  });

  describe("getVapidPublicKey", () => {
    test("returns the env VAPID_PUBLIC_KEY when set", () => {
      const prev = process.env.VAPID_PUBLIC_KEY;
      process.env.VAPID_PUBLIC_KEY = "test-key";
      try {
        assert.strictEqual(service.getVapidPublicKey(), "test-key");
      } finally {
        process.env.VAPID_PUBLIC_KEY = prev;
      }
    });

    test("returns null when VAPID_PUBLIC_KEY is empty", () => {
      const prev = process.env.VAPID_PUBLIC_KEY;
      process.env.VAPID_PUBLIC_KEY = "";
      try {
        assert.strictEqual(service.getVapidPublicKey(), null);
      } finally {
        process.env.VAPID_PUBLIC_KEY = prev;
      }
    });
  });

  describe("sendNewMessageNotification", () => {
    test("no-ops (debug log) when VAPID is not configured", async () => {
      // VAPID vars are unset in the test env.
      await service.sendNewMessageNotification("did:recipient");
      assert.strictEqual(mockLogger.debug.mock.calls.length, 1);
      assert.strictEqual(mockDb.selectFrom.mock.calls.length, 0);
    });

    test("skips handle resolution when the recipient has no subscriptions", async () => {
      const keys = generateVAPIDKeys();
      const prev = {
        pub: process.env.VAPID_PUBLIC_KEY,
        priv: process.env.VAPID_PRIVATE_KEY,
        subj: process.env.VAPID_SUBJECT,
      };
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      process.env.VAPID_SUBJECT = "mailto:test@example.com";

      try {
        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockDb.selectFrom.mock.calls.length, 1);
        assert.strictEqual(mockResolver.resolveDidToHandle.mock.calls.length, 0);
      } finally {
        process.env.VAPID_PUBLIC_KEY = prev.pub;
        process.env.VAPID_PRIVATE_KEY = prev.priv;
        process.env.VAPID_SUBJECT = prev.subj;
      }
    });

    test("returns early (no-op) when setVapidDetails throws for a malformed subject", async () => {
      const keys = generateVAPIDKeys();
      const prev = {
        pub: process.env.VAPID_PUBLIC_KEY,
        priv: process.env.VAPID_PRIVATE_KEY,
        subj: process.env.VAPID_SUBJECT,
      };
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      process.env.VAPID_SUBJECT = "not-a-valid-subject";

      try {
        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockLogger.error.mock.calls.length, 1);
        assert.strictEqual(mockDb.selectFrom.mock.calls.length, 0);
      } finally {
        process.env.VAPID_PUBLIC_KEY = prev.pub;
        process.env.VAPID_PRIVATE_KEY = prev.priv;
        process.env.VAPID_SUBJECT = prev.subj;
      }
    });

    // Real web-push against a local self-signed HTTPS server, not a mocked module.
    describe("against a local HTTPS push endpoint", () => {
      let server: https.Server;
      let port: number;
      let nextStatus: number;
      let prevEnv: { pub?: string; priv?: string; subj?: string };
      let prevGlobalAgent: typeof https.globalAgent;

      beforeAll(() => {
        const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-test-certs-"));
        const keyPath = path.join(certDir, "key.pem");
        const certPath = path.join(certDir, "cert.pem");
        execFileSync("openssl", [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-keyout",
          keyPath,
          "-out",
          certPath,
          "-days",
          "1",
          "-nodes",
          "-subj",
          "/CN=127.0.0.1",
          // A SAN entry is required; modern OpenSSL rejects CN-only certs.
          "-addext",
          "subjectAltName=IP:127.0.0.1",
        ]);

        const certPem = fs.readFileSync(certPath);
        nextStatus = 201;
        server = https.createServer(
          { key: fs.readFileSync(keyPath), cert: certPem },
          (req, res) => {
            req.resume();
            req.on("end", () => {
              res.writeHead(nextStatus);
              res.end();
            });
          }
        );

        // Trust this run's CA on the global agent web-push uses, instead of disabling validation process-wide.
        prevGlobalAgent = https.globalAgent;
        https.globalAgent = new https.Agent({ ca: certPem });

        return new Promise<void>((resolve) => {
          server.listen(0, "127.0.0.1", () => {
            port = (server.address() as { port: number }).port;
            fs.rmSync(certDir, { recursive: true, force: true });
            resolve();
          });
        });
      });

      afterAll(() => {
        https.globalAgent = prevGlobalAgent;
        return new Promise<void>((resolve) => server.close(() => resolve()));
      });

      beforeEach(() => {
        nextStatus = 201;
        const keys = generateVAPIDKeys();
        prevEnv = {
          pub: process.env.VAPID_PUBLIC_KEY,
          priv: process.env.VAPID_PRIVATE_KEY,
          subj: process.env.VAPID_SUBJECT,
        };
        process.env.VAPID_PUBLIC_KEY = keys.publicKey;
        process.env.VAPID_PRIVATE_KEY = keys.privateKey;
        process.env.VAPID_SUBJECT = "mailto:test@example.com";

        const subKeys = makeSubscriptionKeys();
        mockDb.selectFrom = mock(() =>
          makeSelectBuilder(undefined, [
            {
              did: "did:recipient",
              endpoint: `https://127.0.0.1:${port}/sub`,
              p256dh: subKeys.p256dh,
              auth: subKeys.auth,
            },
          ])
        );
      });

      afterEach(() => {
        process.env.VAPID_PUBLIC_KEY = prevEnv.pub;
        process.env.VAPID_PRIVATE_KEY = prevEnv.priv;
        process.env.VAPID_SUBJECT = prevEnv.subj;
      });

      test("resolves the recipient's handle and sends successfully", async () => {
        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockResolver.resolveDidToHandle.mock.calls.length, 1);
        assert.strictEqual(mockLogger.error.mock.calls.length, 0);
      });

      test("falls back to a generic no-op when handle resolution fails, but still sends", async () => {
        mockResolver.resolveDidToHandle = mock(async () => {
          throw new Error("resolution failed");
        });

        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockLogger.error.mock.calls.length, 0);
      });

      test("still delivers the notification when the uiLocale read fails, falling back to en", async () => {
        const subKeys = makeSubscriptionKeys();
        mockDb.selectFrom = mock((table: string) => {
          if (table === "user_settings") {
            return {
              select: mock(function (this: any) {
                return this;
              }),
              where: mock(function (this: any) {
                return this;
              }),
              executeTakeFirst: mock(async () => {
                throw new Error("settings read failed");
              }),
            };
          }
          return makeSelectBuilder(undefined, [
            {
              did: "did:recipient",
              endpoint: `https://127.0.0.1:${port}/sub`,
              p256dh: subKeys.p256dh,
              auth: subKeys.auth,
            },
          ]);
        });

        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockLogger.error.mock.calls.length, 0);
        assert.strictEqual(mockLogger.warn.mock.calls.length, 1);
      });

      test("deletes the subscription when the push service reports 410 Gone", async () => {
        nextStatus = 410;
        const deleteBuilder = makeDeleteBuilder();
        mockDb.deleteFrom = mock(() => deleteBuilder);

        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockDb.deleteFrom.mock.calls.length, 1);
        // One info log from deleteSubscription itself, one from the "removed expired" note.
        assert.strictEqual(mockLogger.info.mock.calls.length, 2);
      });

      test("deletes the subscription when the push service reports 404 Not Found", async () => {
        nextStatus = 404;
        const deleteBuilder = makeDeleteBuilder();
        mockDb.deleteFrom = mock(() => deleteBuilder);

        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockDb.deleteFrom.mock.calls.length, 1);
      });

      test("logs an error and keeps the subscription for other failure statuses", async () => {
        nextStatus = 500;

        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockDb.deleteFrom.mock.calls.length, 0);
        assert.strictEqual(mockLogger.error.mock.calls.length, 1);
      });

      test("logs an error (statusCode undefined) when the failure has no HTTP response at all", async () => {
        // A malformed key fails web-push validation before any network call, so the error has no statusCode.
        mockDb.selectFrom = mock(() =>
          makeSelectBuilder(undefined, [
            {
              did: "did:recipient",
              endpoint: `https://127.0.0.1:${port}/sub`,
              p256dh: "too-short",
              auth: "also-too-short",
            },
          ])
        );

        await service.sendNewMessageNotification("did:recipient");

        assert.strictEqual(mockDb.deleteFrom.mock.calls.length, 0);
        assert.strictEqual(mockLogger.error.mock.calls.length, 1);
      });
    });
  });
});

describe("createConcurrencyLimiter", () => {
  test("runs up to `limit` tasks concurrently, queuing the rest", async () => {
    const limiter = createConcurrencyLimiter(2);
    let active = 0;
    let maxActive = 0;
    const task = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    };

    await Promise.all(Array.from({ length: 5 }, () => limiter.run(task)));

    assert.strictEqual(maxActive, 2, "never exceeded the concurrency limit");
  });

  test("propagates results and rejections faithfully", async () => {
    const limiter = createConcurrencyLimiter(3);
    const ok = await limiter.run(() => Promise.resolve(42));
    assert.strictEqual(ok, 42);

    await assert.rejects(
      limiter.run(() => Promise.reject(new Error("boom"))),
      /boom/
    );
  });

  test("exposes active/pending counts while tasks are in flight and queued", async () => {
    const limiter = createConcurrencyLimiter(1);
    let releaseFirst: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstRun = limiter.run(() => blocked);
    const secondRun = limiter.run(() => Promise.resolve());
    assert.strictEqual(limiter.active, 1);
    assert.strictEqual(limiter.pending, 1);

    releaseFirst();
    await Promise.all([firstRun, secondRun]);
    assert.strictEqual(limiter.active, 0);
    assert.strictEqual(limiter.pending, 0);
  });

  test("resumes queue slots as tasks complete", async () => {
    const limiter = createConcurrencyLimiter(1);
    const order: number[] = [];
    const makeTask = (id: number) => async () => {
      order.push(id);
      await new Promise((r) => setTimeout(r, 5));
    };

    await Promise.all([
      limiter.run(makeTask(1)),
      limiter.run(makeTask(2)),
      limiter.run(makeTask(3)),
    ]);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });
});
