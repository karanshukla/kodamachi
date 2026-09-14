import type { CSSProperties } from "react";

import { fillInk, onFill, onFillMuted, radiusCard } from "../../styles/tokens";

export const card: CSSProperties = {
  borderRadius: radiusCard,
  background: fillInk,
  overflow: "hidden",
  padding: "22px 24px",
};

export const eyebrow: CSSProperties = {
  color: onFillMuted,
  letterSpacing: "0.1em",
};

export const url: CSSProperties = {
  color: onFill,
  letterSpacing: "-0.01em",
  wordBreak: "break-all",
};
