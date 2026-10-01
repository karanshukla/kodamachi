import assert from "node:assert";
import { test, describe } from "bun:test";

import { Hono } from "hono";
import { z } from "zod";

import { SEND_LIMIT_PER_RECIPIENT, sendRateLimiter } from "../hono/rate-limits";
import { validateJson } from "../hono/route-helpers";

function makeApp(): Hono {
  const app = new Hono();
  app.post(
    "/messages/send",
    sendRateLimiter(),
    validateJson(z.object({ recipient: z.string() })),
    (c) => c.json({ recipient: c.req.valid("json").recipient })
  );
  return app;
}

function send(app: Hono, recipient: string, ip = "203.0.113.1") {
  return app.request("/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ recipient }),
  });
}

async function sendUpToLimit(app: Hono, recipient: string): Promise<number> {
  let status = 0;
  for (let i = 0; i < SEND_LIMIT_PER_RECIPIENT; i++) {
    status = (await send(app, recipient)).status;
  }
  return status;
}

describe("sendRateLimiter", () => {
  test("accepts a tenth question to one recipient", async () => {
    assert.strictEqual(await sendUpToLimit(makeApp(), "did:plc:alice"), 200);
  });

  test("rejects an eleventh", async () => {
    const app = makeApp();
    await sendUpToLimit(app, "did:plc:alice");

    assert.strictEqual((await send(app, "did:plc:alice")).status, 429);
  });

  test("counts each recipient separately", async () => {
    const app = makeApp();
    await sendUpToLimit(app, "did:plc:alice");

    assert.strictEqual((await send(app, "did:plc:bob")).status, 200);
  });

  test("counts each sender separately", async () => {
    const app = makeApp();
    await sendUpToLimit(app, "did:plc:alice");

    assert.strictEqual((await send(app, "did:plc:alice", "203.0.113.2")).status, 200);
  });

  test("leaves the body readable for the validator", async () => {
    const res = await send(makeApp(), "did:plc:alice");

    assert.deepStrictEqual(await res.json(), { recipient: "did:plc:alice" });
  });
});
