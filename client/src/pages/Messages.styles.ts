import type { CSSProperties } from "react";

import { surface, surfaceGhost, textDimmed } from "../styles/tokens";

export const emptyState: CSSProperties = {
  background: surface,
};

/** A soft tile around the icon, the one ornament the empty state carries. */
export const emptyIcon: CSSProperties = {
  width: 52,
  height: 52,
  margin: "0 auto 16px",
  borderRadius: 14,
  background: surfaceGhost,
  color: textDimmed,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const emptyMascot: CSSProperties = {
  marginBottom: 16,
};

export const emptyBody: CSSProperties = {
  lineHeight: 1.55,
};
