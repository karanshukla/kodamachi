/**
 * Predicts the rendered size of a question card before Chromium, so the render
 * can ask for an exact viewport. Width, font size and height all come from
 * `themeLayout()`, so they cannot drift apart.
 *
 * @see [question-image-layout.test.ts](../../tests/question-image-layout.test.ts) —
 * pins the wrapping cases and the font-size boundaries.
 */

/** Where the message font steps down, measured in codepoints, not UTF-16 units. */
const FONT_STEP_DOWN_AT = { medium: 60, small: 120 } as const;

const LINE_HEIGHT_RATIO = 1.45;

export type ThemeName = "default" | "compressed" | "twitter";

interface FontScale {
  large: number;
  medium: number;
  small: number;
}

/** Mirrors each template's CSS box model. `charWidthCoeff` is average glyph width over `fontSize`, measured per font. */
const THEME_LAYOUT = {
  default: {
    cardWidth: 360,
    fontScale: { large: 26, medium: 21, small: 17 },
    horizontalInsets: { bodyPadding: 32, bubblePadding: 36 },
    bubbleVerticalPadding: 12 + 12,
    charWidthCoeff: 0.58,
    chrome: { topPad: 16, header: 20, headerGap: 10, bubbleGap: 10, footer: 16, bottomPad: 16 },
    minHeight: 0,
  },
  compressed: {
    cardWidth: 380,
    fontScale: { large: 19, medium: 16, small: 14 },
    horizontalInsets: { bodyPadding: 24, border: 4, cardPadding: 13 + 14 },
    bubbleVerticalPadding: 0,
    charWidthCoeff: 0.53,
    chrome: {
      bodyPad: 24,
      cardPad: 24,
      label: 11,
      labelMargin: 6,
      footerMargin: 8,
      footer: 12,
    },
    minHeight: 100,
  },
  twitter: {
    cardWidth: 420,
    fontScale: { large: 21, medium: 17, small: 14 },
    horizontalInsets: { cardPadding: 16 + 16 },
    bubbleVerticalPadding: 0,
    charWidthCoeff: 0.55,
    chrome: { cardTop: 14, avatarRow: 36, headerMargin: 10, footer: 37, cardBottom: 12 },
    minHeight: 140,
  },
} as const satisfies Record<ThemeName, unknown>;

type ThemeLayout = (typeof THEME_LAYOUT)[ThemeName];

export function isThemeName(name: string): name is ThemeName {
  return Object.hasOwn(THEME_LAYOUT, name);
}

export function messageFontSize(scale: FontScale, codepointCount: number): number {
  if (codepointCount <= FONT_STEP_DOWN_AT.medium) return scale.large;
  if (codepointCount <= FONT_STEP_DOWN_AT.small) return scale.medium;
  return scale.small;
}

/** Simulates CSS word-wrap, including break-word on over-long words. */
export function wrapLines(
  text: string,
  fontSize: number,
  areaWidth: number,
  charWidthCoeff: number
): number {
  const charsPerLine = areaWidth / (fontSize * charWidthCoeff);
  let totalLines = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      totalLines++;
      continue;
    }
    let charsOnCurrentLine = 0;
    let paragraphLines = 1;
    for (const word of words) {
      const wordLength = [...word].length;
      if (wordLength > charsPerLine) {
        if (charsOnCurrentLine > 0) paragraphLines++;
        paragraphLines += Math.ceil(wordLength / charsPerLine) - 1;
        charsOnCurrentLine = wordLength % charsPerLine || charsPerLine;
      } else if (charsOnCurrentLine === 0) {
        charsOnCurrentLine = wordLength;
      } else if (charsOnCurrentLine + 1 + wordLength <= charsPerLine) {
        charsOnCurrentLine += 1 + wordLength;
      } else {
        paragraphLines++;
        charsOnCurrentLine = wordLength;
      }
    }
    totalLines += paragraphLines;
  }
  return Math.max(1, totalLines);
}

function sum(parts: Readonly<Record<string, number>>): number {
  return Object.values(parts).reduce((total, part) => total + part, 0);
}

function cardHeight(layout: ThemeLayout, text: string, fontSize: number): number {
  const textAreaWidth = layout.cardWidth - sum(layout.horizontalInsets);
  const lines = wrapLines(text, fontSize, textAreaWidth, layout.charWidthCoeff);
  const textHeight = Math.ceil(lines * fontSize * LINE_HEIGHT_RATIO) + layout.bubbleVerticalPadding;

  return Math.max(textHeight + sum(layout.chrome), layout.minHeight);
}

export interface ThemeMetrics {
  width: number;
  height: number;
  fontSize: number;
}

/** `renderedText` is what flows through the text block; for twitter it includes the handle mention. */
export function themeLayout(
  theme: ThemeName,
  message: string,
  renderedText: string = message
): ThemeMetrics {
  const layout = THEME_LAYOUT[theme];
  const fontSize = messageFontSize(layout.fontScale, [...message].length);
  return {
    width: layout.cardWidth,
    height: cardHeight(layout, renderedText, fontSize),
    fontSize,
  };
}
