import { MARK_GLYPH_PATH, MARK_TILE_RADIUS } from "#/lib/brand";

/** `client/src/components/BrandMark.tsx`'s outline as inline SVG: no second request mid-render, no webfont. */
export function markTile(size: number, tile: string, glyph: string): string {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 160 160" aria-hidden="true"><rect width="160" height="160" rx="${MARK_TILE_RADIUS}" fill="${tile}"/><path d="${MARK_GLYPH_PATH}" fill="${glyph}"/></svg>`;
}
