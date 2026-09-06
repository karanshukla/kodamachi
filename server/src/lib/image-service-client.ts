import type { Logger } from "pino";

import { env } from "#/lib/env";

// The image service runs with Railway's Serverless (app-sleeping) enabled and
// launches Chromium lazily, so a request that arrives after an idle stretch
// pays a container wake plus a browser launch before it can render. The
// deadline has to cover both, not just a warm render.
export const IMAGE_SERVICE_DEADLINE_MS = 30_000;

// Shorter than a render's budget since nobody is blocked on it, but still a
// retry budget and not a bare fetch: the first packet wakes the container, and
// Railway's edge answers 502 until that wake finishes.
const IMAGE_SERVICE_WARM_DEADLINE_MS = 15_000;

// A sleeping service answers before it is ready, and those answers are HTTP
// responses rather than network errors: Railway's edge returns 502 while the
// container is still waking, and the image service itself returns 503 while
// Chromium is still launching. Treating any response as final would turn every
// wake into a user-visible failure. 4xx is excluded on purpose — a rejected
// payload fails identically on every attempt — as is 429, where retrying only
// adds load to a limiter that is already shedding.
const WAKE_RETRYABLE_STATUSES = new Set([408, 502, 503, 504]);

const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 2000;
const RETRY_BACKOFF_FACTOR = 1.5;

// Each attempt gets its own AbortController so one hung connection cannot eat
// the whole deadline and starve the retry that would have succeeded.
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let delay = INITIAL_RETRY_DELAY_MS;
  let lastError: unknown;
  let lastRetryableResponse: { status: number; statusText: string; body: string } | undefined;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), remaining);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!WAKE_RETRYABLE_STATUSES.has(response.status)) {
        clearTimeout(abortTimer);
        return response;
      }
      // Drained (with the abort timer still armed) so the connection returns to
      // the pool instead of being held open by the next retry.
      lastRetryableResponse = {
        status: response.status,
        statusText: response.statusText,
        body: await response.text(),
      };
      clearTimeout(abortTimer);
    } catch (err) {
      clearTimeout(abortTimer);
      lastError = err;
    }
    const remainingAfter = deadline - Date.now();
    if (remainingAfter <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, remainingAfter)));
    delay = Math.min(Math.ceil(delay * RETRY_BACKOFF_FACTOR), MAX_RETRY_DELAY_MS);
  }
  // Exhausted while the service was still waking: hand back the last real
  // response so the caller logs the actual status instead of a generic throw.
  if (lastRetryableResponse) {
    const { status, statusText, body } = lastRetryableResponse;
    return new Response(body, { status, statusText });
  }
  throw lastError;
}

/**
 * Asks the image service to launch Chromium ahead of a render expected shortly.
 *
 * @see [image-service-client.test.ts](../tests/image-service-client.test.ts) —
 * pins that a failed warm stays silent rather than reaching the user.
 */
export async function warmImageService(
  logger: Logger,
  deadlineMs: number = IMAGE_SERVICE_WARM_DEADLINE_MS
): Promise<void> {
  const url = new URL("warm", env.EXPORT_HTML_URL).toString();
  try {
    const response = await fetchWithRetry(url, { method: "POST" }, deadlineMs);
    await response.text().catch(() => "");
    if (!response.ok) {
      logger.warn({ status: response.status }, "Image service warm did not complete");
      return;
    }
    logger.debug("Image service warmed ahead of render");
  } catch (err) {
    logger.warn({ err }, "Image service warm failed");
  }
}
