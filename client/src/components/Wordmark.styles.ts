import type { CSSProperties } from "react";

import { textDefault } from "../styles/tokens";

export const name = (size: number): CSSProperties => ({
  fontFamily: "var(--ds-font-sans)",
  fontWeight: 600,
  fontSize: size,
  letterSpacing: "-0.02em",
  lineHeight: 1,
  color: textDefault,
});
