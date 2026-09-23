import type { CSSProperties } from "react";

import { border, radiusControl, surface } from "../styles/tokens";

/** The anonymity note sits in its own paper card under the ask card. */
export const disclaimer: CSSProperties = {
  background: surface,
  border,
  borderRadius: radiusControl,
  padding: "14px 16px",
};
