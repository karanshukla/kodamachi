import type { CSSProperties } from "react";

import { accentText } from "../../styles/tokens";

export const panel: CSSProperties = {
  padding: 24,
};

export const value = (fontSize: number): CSSProperties => ({
  fontSize,
  color: accentText,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
});
