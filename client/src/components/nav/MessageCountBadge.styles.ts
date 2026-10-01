import type { CSSProperties } from "react";

import { radiusPill } from "../../styles/tokens";

export const badge: CSSProperties = {
  background: "var(--ds-attention-bg)",
  color: "var(--ds-attention-fg)",
  minWidth: 20,
  height: 20,
  padding: "0 6px",
  borderRadius: radiusPill,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: "20px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
