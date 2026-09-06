import assert from "node:assert";
import { test, describe, afterEach, mock } from "bun:test";

import { fetchWithRetry, warmImageService } from "../lib/image-service-client";

import { mockFetch } from "./helpers/mocks";

function stubLogger() {
  const warnings: unknown[] = [];
  const debugs: unknown[] = [];
  return {
    warnings,
    debugs,
    logger: {
      warn: (...args: unknown[]) => warnings.push(args),
      debug: (...args: unknown[]) => debugs.push(args),
    } as any,
  };
}

describe("fetchWithRetry", () => {
  afterEach(() => {
    mock.restore();
  });

  test("returns response immediately on first successful attempt", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    mockFetch(async () => mockResponse);

    const result = await fetchWithRetry("http://test/", {}, 5000);

    assert.strictEqual(result, mockResponse);
    assert.strictEqual((globalThis.fetch as any).mock.calls.length, 1);
  });

  test("retries on network error and returns response when service comes up", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      if (callCount < 3) throw new Error("ECONNREFUSED");
      return mockResponse;
    });

    const result = await fetchWithRetry("http://test/", {}, 5000);

    assert.strictEqual(result, mockResponse);
    assert.strictEqual(callCount, 3);
  });

  test("throws the last network error after timeout is exhausted", async () => {
    const networkError = new Error("connect ECONNREFUSED 127.0.0.1:3033");
    mockFetch(async () => {
      throw networkError;
    });

    await assert.rejects(() => fetchWithRetry("http://test/", {}, 50), networkError);
  });

  test("does not retry a 500 — the service answered, the render itself failed", async () => {
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      return new Response("internal error", { status: 500 });
    });

    const result = await fetchWithRetry("http://test/", {}, 5000);

    assert.strictEqual(result.status, 500);
    assert.strictEqual(callCount, 1);
  });

  test("retries a 502 from Railway's edge while the service is waking", async () => {
    // A slept Railway service answers the first request from the edge with a
    // 502 before the container is back. Treating that as final would make every
    // wake a user-visible image-generation failure.
    const mockResponse = new Response("ok", { status: 200 });
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      if (callCount < 3) return new Response("Application failed to respond", { status: 502 });
      return mockResponse;
    });

    const result = await fetchWithRetry("http://test/", {}, 5000);

    assert.strictEqual(result, mockResponse);
    assert.strictEqual(callCount, 3);
  });

  test("retries a 503 emitted while Chromium is still launching", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      if (callCount < 2) {
        return new Response(JSON.stringify({ error: "Browser unavailable" }), { status: 503 });
      }
      return mockResponse;
    });

    const result = await fetchWithRetry("http://test/", {}, 5000);

    assert.strictEqual(result, mockResponse);
    assert.strictEqual(callCount, 2);
  });

  test("retries 408 and 504 but never a 4xx the payload caused", async () => {
    for (const status of [408, 504]) {
      let callCount = 0;
      mockFetch(async () => {
        callCount++;
        if (callCount < 2) return new Response("", { status });
        return new Response("ok", { status: 200 });
      });
      const result = await fetchWithRetry("http://test/", {}, 5000);
      assert.strictEqual(result.status, 200, `status ${status} should have been retried`);
      assert.strictEqual(callCount, 2);
      mock.restore();
    }

    // 400 is a rejected payload and 429 is a limiter already shedding load —
    // both fail identically on retry, so neither is worth another attempt.
    for (const status of [400, 429]) {
      let callCount = 0;
      mockFetch(async () => {
        callCount++;
        return new Response("nope", { status });
      });
      const result = await fetchWithRetry("http://test/", {}, 5000);
      assert.strictEqual(result.status, status);
      assert.strictEqual(callCount, 1, `status ${status} must not be retried`);
      mock.restore();
    }
  });

  test("returns the last wake response, not a throw, when the deadline expires", async () => {
    // The caller logs response.status/body on failure. Throwing here would
    // replace a diagnosable "502 from the edge" with a generic error.
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      return new Response("Application failed to respond", { status: 502 });
    });

    const result = await fetchWithRetry("http://test/", {}, 50);

    assert.strictEqual(result.status, 502);
    assert.strictEqual(await result.text(), "Application failed to respond");
    assert.ok(callCount >= 1);
  });

  test("breaks without sleeping when deadline expires during a failed fetch attempt", async () => {
    let fetchCallCount = 0;
    mockFetch(async () => {
      fetchCallCount++;
      // Simulate a fetch that takes 50ms — longer than the 10ms overall timeout
      await new Promise((r) => setTimeout(r, 50));
      throw new Error("slow connect error");
    });

    await assert.rejects(
      () => fetchWithRetry("http://test/", {}, 10),
      (err: unknown) => err instanceof Error && err.message === "slow connect error"
    );

    // Only one fetch attempt: deadline passed during the request, so the
    // `if (remainingAfter <= 0) break` path exits without a retry sleep.
    assert.strictEqual(fetchCallCount, 1);
  });

  test("passes url and init options through to fetch, adding an AbortSignal", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    const capturedArgs: any[] = [];
    mockFetch(async (...args: any[]) => {
      capturedArgs.push(args);
      return mockResponse;
    });

    const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
    await fetchWithRetry("http://test/endpoint", init, 5000);

    assert.strictEqual(capturedArgs[0][0], "http://test/endpoint");
    const passedInit = capturedArgs[0][1];
    assert.strictEqual(passedInit.method, init.method);
    assert.deepStrictEqual(passedInit.headers, init.headers);
    assert.strictEqual(passedInit.body, init.body);
    assert.ok(passedInit.signal instanceof AbortSignal, "Should include an AbortSignal");
  });
});

describe("warmImageService", () => {
  afterEach(() => {
    mock.restore();
  });

  test("posts to the service's /warm path", async () => {
    const capturedArgs: any[] = [];
    mockFetch(async (...args: any[]) => {
      capturedArgs.push(args);
      return new Response("{}", { status: 200 });
    });
    const { logger } = stubLogger();

    await warmImageService(logger);

    assert.strictEqual(capturedArgs[0][0], "http://localhost:3033/warm");
    assert.strictEqual(capturedArgs[0][1].method, "POST");
  });

  test("stays silent when the warm succeeds", async () => {
    mockFetch(async () => new Response("{}", { status: 200 }));
    const { logger, warnings } = stubLogger();

    await warmImageService(logger);

    assert.strictEqual(warnings.length, 0);
  });

  test("warns rather than throwing when the service answers non-OK", async () => {
    mockFetch(async () => new Response("nope", { status: 500 }));
    const { logger, warnings } = stubLogger();

    await assert.doesNotReject(() => warmImageService(logger));
    assert.strictEqual(warnings.length, 1);
  });

  test("swallows a network failure so a failed warm never reaches the user", async () => {
    mockFetch(async () => {
      throw new Error("connection refused");
    });
    const { logger, warnings } = stubLogger();

    await assert.doesNotReject(() => warmImageService(logger, 50));
    assert.strictEqual(warnings.length, 1);
  });
});
