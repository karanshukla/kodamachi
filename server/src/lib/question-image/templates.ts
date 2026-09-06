import type { ThemeMetrics, ThemeName } from "./layout";
import { renderCompressedCard } from "./themes/compressed";
import { renderDefaultCard } from "./themes/default";
import { renderTwitterCard } from "./themes/twitter";

export interface RenderedTemplate extends ThemeMetrics {
  html: string;
}

/**
 * Picks the template for a stored `imageTheme`. `escapedMessage` is HTML-safe;
 * `message` is the raw text, which only the layout reads.
 *
 * @see [question-image-templates.test.ts](../../tests/question-image-templates.test.ts) —
 * pins each theme's width, the twitter mention, and the font-stack ordering.
 */
export function renderQuestionCard(
  theme: ThemeName,
  escapedMessage: string,
  footerText: string,
  message: string,
  handle?: string
): RenderedTemplate {
  switch (theme) {
    case "compressed":
      return renderCompressedCard(escapedMessage, footerText, message);
    case "twitter":
      return renderTwitterCard(escapedMessage, footerText, message, handle);
    default:
      return renderDefaultCard(escapedMessage, footerText, message);
  }
}
