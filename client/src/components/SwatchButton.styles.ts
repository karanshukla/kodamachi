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
  // Four swatches share a phone-width card, where the button's own padding is
  // what forces "Midnight" onto two lines; the label takes most of it back. A
  // longer name (de "Mitternacht") still breaks rather than spilling over.
  margin: "0 -7px",
  overflowWrap: "break-word",
};
