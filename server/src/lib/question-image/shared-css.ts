export const PRECONNECT = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;

export const NOTO_LINK = `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+KR:wght@400;700&family=Noto+Sans+SC:wght@400;700&family=Noto+Sans+TC:wght@400;700&family=Noto+Sans+Arabic:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Hebrew:wght@400;700&family=Noto+Sans+Thai:wght@400;700&family=Noto+Color+Emoji&display=swap" rel="stylesheet">`;

/**
 * 'Noto Color Emoji' must stay last: its U+0020 has a 1.25em advance, so earlier
 * it wins the space glyph when webfonts fail and word gaps blow out ~4.5x.
 * `document.fonts.ready` resolves on failed loads too, so the font wait does
 * not protect against this. Emoji still resolve per-glyph from last place.
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
