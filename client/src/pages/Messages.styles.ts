import type { CSSProperties } from "react";

import { surfaceGhost, textDimmed } from "../styles/tokens";

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

export const emptyBody: CSSProperties = {
  lineHeight: 1.55,
};
