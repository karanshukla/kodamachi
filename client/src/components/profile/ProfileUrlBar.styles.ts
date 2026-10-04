import type { CSSProperties } from "react";

import { border, radiusPill, surface, textDefault, textDimmed } from "../../styles/tokens";

export const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: surface,
  border,
  height: 32,
  padding: "0 14px",
  borderRadius: radiusPill,
  fontSize: 13,
  color: textDimmed,
  letterSpacing: "0.01em",
};

export const pillHandle: CSSProperties = {
  color: textDefault,
  fontWeight: 600,
};

export const action: CSSProperties = {
  background: surface,
  border,
  color: textDimmed,
};
