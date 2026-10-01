import type { CSSProperties } from "react";

import { border, radiusControl, surface } from "../styles/tokens";

export const disclaimer: CSSProperties = {
  background: surface,
  border,
  borderRadius: radiusControl,
  padding: "14px 16px",
};
