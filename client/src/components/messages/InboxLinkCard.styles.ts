import type { CSSProperties } from "react";

import { heroBg, onHero, onHeroMuted, radiusCard } from "../../styles/tokens";

export const card = {
  borderRadius: radiusCard,
  background: heroBg,
  overflow: "hidden",
  padding: "22px 24px",
  "--ds-focus-ring": onHero,
} as CSSProperties;

export const eyebrow: CSSProperties = {
  color: onHeroMuted,
  letterSpacing: "0.1em",
};

export const url: CSSProperties = {
  color: onHero,
  letterSpacing: "-0.01em",
  wordBreak: "break-all",
};
