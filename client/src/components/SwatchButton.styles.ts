import type { CSSProperties } from "react";

import { borderColor, selectedBg, selectedBorder, textDefault } from "../styles/tokens";

/** Selected is the 1.5px ink border on tint; the rest is a hairline on paper. */
export const button = (selected: boolean, disabled?: boolean): CSSProperties => ({
  background: selected ? selectedBg : "transparent",
  border: selected ? `1.5px solid ${selectedBorder}` : `1px solid ${borderColor}`,
  borderRadius: 10,
  padding: 8,
  cursor: disabled ? "default" : "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 7,
  flex: 1,
  minWidth: 0,
  transition: "border-color var(--ds-dur-fast) var(--ds-ease)",
});

export const preview = (aspectRatio: string): CSSProperties => ({
  aspectRatio,
  borderRadius: 6,
  overflow: "hidden",
});

export const label: CSSProperties = {
  color: textDefault,
  fontSize: 12,
  fontWeight: 600,
  // A long single-word preset name (pt "Meia-noite") is narrower than its
  // swatch on every viewport but the smallest phones, where it breaks rather
  // than spilling over the neighbouring swatch.
  overflowWrap: "break-word",
};
