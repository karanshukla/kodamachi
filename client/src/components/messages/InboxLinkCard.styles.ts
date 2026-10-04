import type { CSSProperties } from "react";

import { eyebrow as eyebrowLabel, heroBg, onHero, onHeroMuted } from "../../styles/tokens";

export const card = {
  background: heroBg,
  overflow: "hidden",
  padding: "22px 24px",
  "--ds-focus-ring": onHero,
} as CSSProperties;

export const eyebrow: CSSProperties = {
  ...eyebrowLabel,
  color: onHeroMuted,
};

export const url: CSSProperties = {
  color: onHero,
  letterSpacing: "-0.01em",
  wordBreak: "break-all",
};
