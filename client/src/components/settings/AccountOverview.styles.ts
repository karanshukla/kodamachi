import type { CSSProperties } from "react";

import { accentText, border, radiusCard, surface } from "../../styles/tokens";

export const panel: CSSProperties = {
  borderRadius: radiusCard,
  padding: 24,
  background: surface,
  border,
};

export const value = (fontSize: number): CSSProperties => ({
  fontSize,
  color: accentText,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
});
