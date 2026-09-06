/* v8 ignore start */
import type { Logger } from "pino";

import { APP_DOMAIN, APP_NAME, SHARE_DOMAIN } from "#/lib/brand";
import { env } from "#/lib/env";
/* v8 ignore stop */

import {
  fetchWithRetry,
  warmImageService,
  IMAGE_SERVICE_DEADLINE_MS,
} from "./image-service-client";
import { isThemeName } from "./question-image/layout";
import { renderQuestionCard } from "./question-image/templates";

export interface ImageGenerationResult {
  imageBlob?: Buffer;
  imageAltText?: string;
  width?: number;
  height?: number;
}

/**
 * The rendered card is requested at this multiple of its CSS size and
 * downsampled back to half of it, so text stays sharp on a retina timeline
 * without shipping a 4x PNG to Bluesky.
 */
const RENDER_SCALE = 4;
const OUTPUT_SCALE = 2;

const PNG_COMPRESSION_LEVEL = 9;

/**
 * sharp bundles libvips as a native addon (tens of MB, plus its own thread
 * pool), so a static `import "sharp"` pulls that into every server process
 * at boot even though it's only invoked here, on the reply-with-image path.
 * Deferred to first use so an idle process — the common case — never pays
 * for it; the dynamic import is cached after that.
 */
async function loadSharp() {
  const sharp = (await import("sharp")).default;
  // Every render is a distinct message, so sharp's operation cache (up to
  // 50MB by default) never gets a hit here — only holds memory an idle
  // process doesn't get back.
  sharp.cache(false);
  return sharp;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export async function generateQuestionImage(
  originalMessage: string,
  logger: Logger,
  userBskyHandle?: string,
  themeName: string = "default"
): Promise<ImageGenerationResult> {
  if (!originalMessage) {
    logger.info("Skipping image generation due to missing original message.");
    return {};
  }

  const footerText = userBskyHandle ? `${SHARE_DOMAIN}/${userBskyHandle}` : APP_DOMAIN;
  const theme = isThemeName(themeName) ? themeName : "default";
  const { html, width, height } = renderQuestionCard(
    theme,
    escapeHtml(originalMessage),
    footerText,
    originalMessage,
    userBskyHandle
  );

  try {
    logger.info(`Attempting to generate image via service at: ${env.EXPORT_HTML_URL}`);
    const response = await fetchWithRetry(
      env.EXPORT_HTML_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: html,
          format: "png",
          options: { width: width * RENDER_SCALE, height: height * RENDER_SCALE },
        }),
      },
      IMAGE_SERVICE_DEADLINE_MS
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        { error: errorBody, status: response.status },
        "Failed to generate image with export-html service"
      );
      if (response.status >= 400 && response.status < 500) {
        logger.debug({ htmlSent: html }, "HTML sent to image service (client error)");
      }
      return {};
    }

    const sharp = await loadSharp();
    const outputWidth = width * OUTPUT_SCALE;
    const outputHeight = height * OUTPUT_SCALE;
    const imageBlob = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(outputWidth, outputHeight, { kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: PNG_COMPRESSION_LEVEL })
      .toBuffer();

    return {
      imageBlob,
      imageAltText: `Image of the anonymous question: "${originalMessage}" - Answered on ${APP_NAME}.app`,
      width: outputWidth,
      height: outputHeight,
    };
  } catch (err) {
    logger.error(err, "Error during image generation process");
    return {};
  }
}

export const imageGenerator = {
  generateQuestionImage,
  warmImageService,
  /* v8 ignore next 1 */
};
