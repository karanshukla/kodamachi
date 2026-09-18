import { APP_NAME, MARK_GLYPH_PATH, MARK_TILE_RADIUS } from "../lib/brand";
import { mascotSrc } from "../lib/mascot";
import { markBg, markFg } from "../styles/tokens";

interface BrandMarkProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
}

/**
 * 木 (Noto Serif JP, weight 600) as an outline, so the mark needs no webfont
 * and renders identically as a favicon, in the app header, and on the OG card.
 * Once `assets/mascot/mark.*` exists, the app draws that instead; the favicon and
 * OG card keep 木.
 */
export function BrandMark({
  size = 40,
  className,
  style,
  "aria-hidden": ariaHidden,
}: BrandMarkProps) {
  const mark = mascotSrc("mark");
  if (mark) {
    return (
      <img
        src={mark}
        width={size}
        height={size}
        alt={ariaHidden ? "" : APP_NAME}
        aria-hidden={ariaHidden}
        draggable={false}
        className={className}
        style={{ flexShrink: 0, objectFit: "contain", ...style }}
      />
    );
  }
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
