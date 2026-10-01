import type { Logger } from "pino";

import { env } from "#/lib/env";

// Railway app-sleeping plus lazy Chromium: the deadline must cover a container wake and a browser launch.
export const IMAGE_SERVICE_DEADLINE_MS = 30_000;

const IMAGE_SERVICE_WARM_DEADLINE_MS = 15_000;

// Wake-time answers: Railway's edge 502s while the container wakes, the image
// service 503s while Chromium launches. 4xx and 429 are not retried: they fail
// identically or add load to a limiter already shedding.
const WAKE_RETRYABLE_STATUSES = new Set([408, 502, 503, 504]);

const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 2000;
const RETRY_BACKOFF_FACTOR = 1.5;

// One AbortController per attempt so a hung connection cannot eat the whole deadline.
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
      // Drained under the armed timer so the connection returns to the pool.
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
  // Hand back the last real response so the caller logs its status.
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
