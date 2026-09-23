import { APP_NAME, MARK_GLYPH_PATH, MARK_TILE_RADIUS } from "../lib/brand";
import { markBg, markFg } from "../styles/tokens";

interface BrandMarkProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
}

/**
 * The interim "k" tile (Schibsted Grotesk, weight 600) as an outline, so it
 * needs no webfont and renders identically as a favicon and on the OG card.
 */
export function BrandMark({
  size = 40,
  className,
  style,
  "aria-hidden": ariaHidden,
}: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      role={ariaHidden ? undefined : "img"}
      aria-label={ariaHidden ? undefined : APP_NAME}
      aria-hidden={ariaHidden}
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      <rect width="160" height="160" rx={MARK_TILE_RADIUS} fill={markBg} />
      <path d={MARK_GLYPH_PATH} fill={markFg} />
    </svg>
  );
}
