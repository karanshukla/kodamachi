import { MARK_GLYPH_PATH, MARK_TILE_RADIUS } from "#/lib/brand";

/**
 * The app mark — 木 as an outline, the same path `client/src/components/BrandMark.tsx`
 * draws — as an inline SVG tile the question-image templates can drop into a
 * flex row. Inlined so the image service never makes a second request for it
 * mid-render, and an outline so it needs no serif webfont.
 */
export function markTile(size: number, tile: string, glyph: string): string {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 160 160" aria-hidden="true"><rect width="160" height="160" rx="${MARK_TILE_RADIUS}" fill="${tile}"/><path d="${MARK_GLYPH_PATH}" fill="${glyph}"/></svg>`;
}
