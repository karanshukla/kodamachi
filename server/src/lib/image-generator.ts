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

/** Rendered at this multiple of CSS size, downsampled to half: sharp on retina without a 4x PNG. */
const RENDER_SCALE = 4;
const OUTPUT_SCALE = 2;

const PNG_COMPRESSION_LEVEL = 9;

/** Deferred: a static `import "sharp"` loads libvips and its thread pool into every idle process. */
async function loadSharp() {
  const sharp = (await import("sharp")).default;
  // Every render is distinct, so sharp's cache (50MB default) never hits.
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
