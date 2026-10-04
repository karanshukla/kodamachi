import { IdResolver, MemoryCache } from "@atproto/identity";

import { createTtlCache } from "./ttl-cache";

const HOUR = 60e3 * 60;
const DAY = HOUR * 24;

export function createIdResolver() {
  return new IdResolver({
    didCache: new MemoryCache(HOUR, DAY),
    backupNameservers: ["8.8.8.8", "1.1.1.1"],
    timeout: 5000,
  });
}

export interface BidirectionalResolver {
  resolveDidToHandle(did: string): Promise<string>;
  resolveDidsToHandles(dids: string[]): Promise<Record<string, string>>;
  resolveHandleToDid(handle: string): Promise<string | undefined>;
}

const CACHE_MAX = 1000;

export function createBidirectionalResolver(resolver: IdResolver) {
  const handleCache = createTtlCache<string | undefined>(CACHE_MAX);
  const didToHandleCache = createTtlCache<string>(CACHE_MAX);

  return {
    async resolveDidToHandle(did: string): Promise<string> {
      const cached = didToHandleCache.get(did);
      if (cached !== undefined) return cached;

      let resolved: string;
      try {
        const didDoc = await resolver.did.resolveAtprotoData(did);
        if (!didDoc || !didDoc.handle) {
          const resolvedHandle = await resolver.handle.resolve(did);
          resolved = resolvedHandle || did;
        } else {
          // Handle must point back at this DID; MemoryCache exposes no freshness
          // signal, so this can't be skipped on a warm didCache entry.
          const resolvedHandleFromDoc = await resolver.handle.resolve(didDoc.handle);
          resolved =
            resolvedHandleFromDoc === did ? didDoc.handle : resolvedHandleFromDoc || didDoc.handle;
        }
      } catch {
        resolved = did;
      }

      // The DID-as-handle fallback is cached too, so failures are not retried per call.
      didToHandleCache.set(did, resolved, HOUR);
      return resolved;
    },

    async resolveDidsToHandles(dids: string[]): Promise<Record<string, string>> {
      const didHandleMap: Record<string, string> = {};
      const results = await Promise.allSettled(dids.map((did) => this.resolveDidToHandle(did)));
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          didHandleMap[dids[index]] = result.value;
        } else {
          didHandleMap[dids[index]] = dids[index];
        }
      });
      return didHandleMap;
    },

    async resolveHandleToDid(handle: string): Promise<string | undefined> {
      const cached = handleCache.get(handle);
      if (cached !== undefined) return cached;

      try {
        const did = await resolver.handle.resolve(handle);
        handleCache.set(handle, did, HOUR);
        return did;
      } catch {
        return undefined;
      }
    },
  };
}
