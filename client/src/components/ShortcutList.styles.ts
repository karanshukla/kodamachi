import type { CSSProperties } from "react";

import { textDimmed } from "../styles/tokens";

/** Small-caps section label rather than a display heading. */
export const heading: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: textDimmed,
  marginBottom: 14,
};

export const row: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "4px 0",
};
