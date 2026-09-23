import type { CSSProperties } from "react";

import { border, radiusPill, textDefault } from "../../styles/tokens";

export const menu = {
  item: { padding: "10px 14px", fontSize: "var(--mantine-font-size-sm)" },
  itemLabel: { overflow: "hidden" },
} as const;

export const trigger: CSSProperties = {
  background: "transparent",
  border,
  borderRadius: radiusPill,
  height: 34,
  color: textDefault,
};
