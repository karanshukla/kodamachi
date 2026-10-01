// Under Bun the rest of index.ts's import graph evaluates before this body, so
// below the floor you see undici's raw "markAsUncloneable is not a function"
// stack (docs/runtime-notes.md). The floor check still fires for importers that
// skip the OAuth graph; withFetchNodePatchDiagnostic covers an install that
// skipped patchedDependencies.

import { isBunVersionBelowFloor, MINIMUM_BUN_VERSION } from "#/lib/bun-version-floor";

const NOT_PATCHED =
  "@atproto-labs/fetch-node is not patched, so the server cannot boot under Bun.\n" +
  "\n" +
  "This almost always means dependencies were installed by npm or yarn rather\n" +
  "than bun: `patchedDependencies` in the root package.json is a Bun-only field\n" +
  "and other installers ignore it silently.\n" +
  "\n" +
  "Fix: install with `bun install`, which docker/Dockerfile.server already does.\n" +
  "On Railway, confirm the service builds from that Dockerfile rather than a\n" +
  "native/RAILPACK build — see issue #293.";

if (isBunVersionBelowFloor(process.versions.bun)) {
  throw new Error(
    `This Bun is ${process.versions.bun}; the server requires ` +
      `${MINIMUM_BUN_VERSION.join(".")} or newer.\n` +
      "\n" +
      "undici 8's CacheStorage constructor calls node:worker_threads\n" +
      ".markAsUncloneable, which Bun only implements from 1.4 onwards. On an\n" +
      "older build the @atproto-labs/fetch-node import throws while the module\n" +
      "graph is still evaluating.\n" +
      "\n" +
      "Fix: upgrade Bun. The Dockerfiles and CI workflows already pin it."
  );
}

/**
 * Rethrows the unpatched-install failure with guidance. Wrap OAuth client
 * construction: `unicastFetchWrap` first throws there (Bun has no
 * `process.versions.undici`), with no earlier tell above the floor.
 */
export function withFetchNodePatchDiagnostic<T>(create: () => T): T {
  try {
    return create();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Unicast SSRF protection requires")) throw err;
    throw new Error(NOT_PATCHED, { cause: err });
  }
}
