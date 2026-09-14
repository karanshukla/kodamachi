import type { CSSProperties } from "react";

import { textDimmed } from "../styles/tokens";

/** Uppercase section label rather than a display heading. */
export const heading: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  color: textDimmed,
  marginBottom: 14,
};

export const row: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "4px 0",
};
