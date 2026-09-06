/** The document head and reset every question-card theme shares. */
export const PRECONNECT = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;

export const NOTO_LINK = `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+KR:wght@400;700&family=Noto+Sans+SC:wght@400;700&family=Noto+Sans+TC:wght@400;700&family=Noto+Sans+Arabic:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Hebrew:wght@400;700&family=Noto+Sans+Thai:wght@400;700&family=Noto+Color+Emoji&display=swap" rel="stylesheet">`;

/**
 * 'Noto Color Emoji' has to stay last, after the generic and after the offline
 * text fallbacks. It ships a U+0020 with a 1.25em advance, so anywhere earlier
 * it wins the space glyph whenever the webfonts ahead of it have not loaded and
 * every word gap in the rendered image blows out to ~4.5x. Chromium's fallback
 * is per-glyph, so emoji still resolve from it in last place — no text font in
 * the stack has emoji glyphs to preempt it.
 *
 * `document.fonts.ready` resolves on a *failed* webfont load as well as a
 * successful one, so the renderer's font wait is no protection here: a Google
 * Fonts hiccup on a Railway cold start is enough to reproduce it.
 *
 * @see [question-image-templates.test.ts](../../tests/question-image-templates.test.ts): pins the
 * emoji family last and a local text fallback ahead of the generic.
 */
export const NOTO_STACK = `'Noto Sans', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans Arabic', 'Noto Sans Devanagari', 'Noto Sans Hebrew', 'Noto Sans Thai', 'Liberation Sans', 'DejaVu Sans', sans-serif, 'Noto Color Emoji'`;

export const BASE_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html { overflow: hidden; zoom: 4; }
  body { overflow: hidden; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-synthesis: none; }
`;
