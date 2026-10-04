// Test-only casts, so no test file needs `as any`.

import { mock, spyOn } from "bun:test";

import type { Logger } from "pino";

/** Replaces `globalThis.fetch` for a test; Bun types it with `preconnect`, so a plain async function is not assignable. */
export function mockFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  return spyOn(globalThis, "fetch").mockImplementation(impl as unknown as typeof fetch);
}

/** A `Logger` whose four asserted levels are spies. */
export function mockLogger() {
  const spies = { info: mock(), error: mock(), debug: mock(), warn: mock() };
  return spies as unknown as Logger & typeof spies;
}

/** Body bytes as `BodyInit`; `Buffer` and `SharedArrayBuffer` views do not satisfy it in typings. */
export function bodyBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}
