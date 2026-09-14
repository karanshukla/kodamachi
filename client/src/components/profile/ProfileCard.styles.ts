import type { CSSProperties } from "react";

import { bannerFallback, borderColor, radiusCard, surface, textDefault } from "../../styles/tokens";

const BANNER_HEIGHT = 160;
const AVATAR_SIZE = 84;

export const card: CSSProperties = {
  borderRadius: radiusCard,
  overflow: "hidden",
  background: surface,
};

export const banner = (url?: string): CSSProperties => ({
  height: BANNER_HEIGHT,
  background: url ? `url(${url}) center/cover no-repeat` : bannerFallback,
  position: "relative",
});

/** Darkens an arbitrary user banner so the avatar's ring stays visible on it. */
export const bannerScrim: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0,0,0,0.2)",
};

export const body: CSSProperties = {
  padding: "0 24px 18px",
  position: "relative",
  background: surface,
};

/**
 * The ring is the card colour, and so is the fill behind the picture: a rounded
 * border's inner edge is tighter than the picture's own corners, and without the
 * fill the banner shows through the gap.
 */
export const avatar: CSSProperties = {
  border: `4px solid ${surface}`,
  background: surface,
  position: "absolute",
  top: -AVATAR_SIZE / 2,
  left: 16,
};

export const displayName: CSSProperties = {
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
};

export const blueskyLink: CSSProperties = {
  flexShrink: 0,
  borderColor,
  color: textDefault,
};

export const description: CSSProperties = {
  lineHeight: 1.5,
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};
