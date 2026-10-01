import assert from "node:assert";
import { describe, test, beforeEach, mock } from "bun:test";

import { createBidirectionalResolver } from "../lib/id-resolver";

// Stub of the IdResolver slice the wrapper touches (did.resolveAtprotoData, handle.resolve). Derives a distinct handle per DID and records calls.
function makeResolverStub() {
  const didResolveAtprotoData = mock(async (did: string) => ({
    did,
    handle: did.replace(/^did:web:/, ""),
  }));
  const handleResolve = mock(async (handle: string) => `did:web:${handle}`);
  return {
    did: { resolveAtprotoData: didResolveAtprotoData },
    handle: { resolve: handleResolve },
    _didResolveAtprotoData: didResolveAtprotoData,
    _handleResolve: handleResolve,
  };
}

describe("createBidirectionalResolver", () => {
  describe("resolveDidToHandle (DID → handle cache — #318)", () => {
    test("caches: a repeat call within TTL makes zero network calls", async () => {
      const resolver = makeResolverStub();
      const bidi = createBidirectionalResolver(resolver as any);

      const first = await bidi.resolveDidToHandle("did:web:alice.test");
      assert.strictEqual(first, "alice.test");

      const firstNetworkCalls =
        resolver._didResolveAtprotoData.mock.calls.length +
        resolver._handleResolve.mock.calls.length;

      const second = await bidi.resolveDidToHandle("did:web:alice.test");
      assert.strictEqual(second, "alice.test");

      const secondNetworkCalls =
        resolver._didResolveAtprotoData.mock.calls.length +
        resolver._handleResolve.mock.calls.length;

      assert.strictEqual(
        secondNetworkCalls,
        firstNetworkCalls,
        "second resolveDidToHandle made additional network calls — cache miss"
      );
    });

    test("a distinct DID is a cache miss and does resolve over the network", async () => {
      const resolver = makeResolverStub();
      const bidi = createBidirectionalResolver(resolver as any);

      await bidi.resolveDidToHandle("did:web:alice.test");
      const callsBefore = resolver._didResolveAtprotoData.mock.calls.length;

      await bidi.resolveDidToHandle("did:web:bob.test");
      const callsAfter = resolver._didResolveAtprotoData.mock.calls.length;

      assert.ok(
        callsAfter > callsBefore,
        "a distinct DID should trigger a network resolveAtprotoData call"
      );
    });

    test("returns the DID unchanged when the doc has no handle, and caches that fallback", async () => {
      const resolver = makeResolverStub();
      resolver._didResolveAtprotoData.mockImplementation(
        async (did: string) =>
          ({
            did,
            handle: undefined,
          }) as any
      );
      resolver._handleResolve.mockImplementation(async () => undefined as unknown as string);

      const bidi = createBidirectionalResolver(resolver as any);

      const result = await bidi.resolveDidToHandle("did:web:ghost");
      assert.strictEqual(result, "did:web:ghost");

      const callsBefore = resolver._didResolveAtprotoData.mock.calls.length;
      await bidi.resolveDidToHandle("did:web:ghost");
      assert.strictEqual(resolver._didResolveAtprotoData.mock.calls.length, callsBefore);
    });

    test("falls back to the DID on resolver failure and caches it", async () => {
      const resolver = makeResolverStub();
      resolver._didResolveAtprotoData.mockImplementation(async () => {
        throw new Error("network down");
      });

      const bidi = createBidirectionalResolver(resolver as any);

      const result = await bidi.resolveDidToHandle("did:web:down");
      assert.strictEqual(result, "did:web:down");

      const callsBefore = resolver._didResolveAtprotoData.mock.calls.length;
      await bidi.resolveDidToHandle("did:web:down");
      assert.strictEqual(resolver._didResolveAtprotoData.mock.calls.length, callsBefore);
    });
  });

  describe("resolveHandleToDid (handle → DID cache)", () => {
    test("caches the resolved DID and serves repeats from cache", async () => {
      const resolver = makeResolverStub();
      const bidi = createBidirectionalResolver(resolver as any);

      const first = await bidi.resolveHandleToDid("alice.test");
      assert.strictEqual(first, "did:web:alice.test");

      const callsBefore = resolver._handleResolve.mock.calls.length;
      const second = await bidi.resolveHandleToDid("alice.test");
      assert.strictEqual(second, "did:web:alice.test");
      assert.strictEqual(
        resolver._handleResolve.mock.calls.length,
        callsBefore,
        "repeat resolveHandleToDid hit the network"
      );
    });

    test("returns undefined (uncached) when the resolver throws", async () => {
      const resolver = makeResolverStub();
      resolver._handleResolve.mockImplementation(async () => {
        throw new Error("dns fail");
      });
      const bidi = createBidirectionalResolver(resolver as any);

      const result = await bidi.resolveHandleToDid("missing.test");
      assert.strictEqual(result, undefined);
    });
  });

  describe("resolveDidsToHandles", () => {
    test("maps each DID to its handle via the cached single-DID path", async () => {
      const resolver = makeResolverStub();
      const bidi = createBidirectionalResolver(resolver as any);

      const result = await bidi.resolveDidsToHandles(["did:web:alice.test", "did:web:bob.test"]);
      assert.strictEqual(result["did:web:alice.test"], "alice.test");
      assert.strictEqual(result["did:web:bob.test"], "bob.test");
    });

    test("falls back to the DID itself when one resolution rejects", async () => {
      const resolver = makeResolverStub();
      resolver._didResolveAtprotoData.mockImplementation(async (did: string) => {
        if (did === "did:web:bob.test") throw new Error("nope");
        return { did, handle: did.replace(/^did:web:/, "") };
      });
      const bidi = createBidirectionalResolver(resolver as any);

      const result = await bidi.resolveDidsToHandles(["did:web:alice.test", "did:web:bob.test"]);
      assert.strictEqual(result["did:web:alice.test"], "alice.test");
      assert.strictEqual(result["did:web:bob.test"], "did:web:bob.test");
    });
  });

  describe("cache bounding (LRU)", () => {
    test("evicts the least-recently-used DID→handle entry once the cap is exceeded", async () => {
      const resolver = makeResolverStub();
      const bidi = createBidirectionalResolver(resolver as any);

      for (let i = 0; i < 1001; i++) {
        await bidi.resolveDidToHandle(`did:web:${i}.test`);
      }
      const callsBefore = resolver._didResolveAtprotoData.mock.calls.length;
      await bidi.resolveDidToHandle("did:web:0.test");
      assert.ok(
        resolver._didResolveAtprotoData.mock.calls.length > callsBefore,
        "evicted key should re-resolve over the network"
      );

      const callsBefore2 = resolver._didResolveAtprotoData.mock.calls.length;
      await bidi.resolveDidToHandle("did:web:1000.test");
      assert.strictEqual(
        resolver._didResolveAtprotoData.mock.calls.length,
        callsBefore2,
        "recent key should still be cached"
      );
    });
  });
});
