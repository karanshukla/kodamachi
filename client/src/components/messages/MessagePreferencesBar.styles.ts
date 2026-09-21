import type { CSSProperties } from "react";

import { disclosureChevron, selectedChrome } from "../../styles/controls.styles";
import {
  border,
  borderColor,
  radiusCard,
  radiusPill,
  selectedBorder,
  textDefault,
  textDimmed,
} from "../../styles/tokens";

const CONTROL_HEIGHT = 36;

export const bar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 10,
};

export const chips: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  flex: "1 1 auto",
  minWidth: 0,
};

/** Off is a hairline, never dimmed text, which reads as disabled rather than off. */
const chipShell = (on: boolean): CSSProperties => ({
  height: CONTROL_HEIGHT,
  borderRadius: radiusPill,
  ...selectedChrome(on),
  color: textDefault,
  transition:
    "border-color var(--ds-dur-fast) var(--ds-ease), background var(--ds-dur-fast) var(--ds-ease)",
});

export const chip = (on: boolean): CSSProperties => ({
  ...chipShell(on),
  padding: "0 13px",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  fontWeight: 600,
});

/** A tick when on, an empty hairline ring when off — never colour alone. */
export const chipMark = (on: boolean): CSSProperties =>
  on
    ? { display: "flex" }
    : {
        width: 10,
        height: 10,
        borderRadius: radiusPill,
        border: `1.5px solid ${borderColor}`,
      };

/** The image chip: one shell, a toggle half and a theme half. */
export const splitChip = (on: boolean): CSSProperties => ({
  ...chipShell(on),
  display: "inline-flex",
  alignItems: "stretch",
  overflow: "hidden",
});

export const splitChipToggle: CSSProperties = {
  padding: "0 11px 0 13px",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  fontWeight: 600,
  color: textDefault,
};

export const splitChipRule = (on: boolean): CSSProperties => ({
  width: 1,
  alignSelf: "stretch",
  background: on ? selectedBorder : borderColor,
  flex: "none",
});

/** Dimmed here means what it says: with no image to theme, the half is inert. */
export const splitChipTheme = (enabled: boolean): CSSProperties => ({
  padding: "0 11px",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 13,
  fontWeight: 600,
  color: enabled ? textDefault : textDimmed,
});

export const actions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginLeft: "auto",
  flex: "none",
};

export const divider: CSSProperties = {
  width: 1,
  height: 24,
  background: borderColor,
};

export const chevron = disclosureChevron;

export const panelSection: CSSProperties = {
  borderTop: border,
};

/**
 * A bottom sheet that ends where its content ends. Mantine's `size` understands
 * only its own scale or a fixed length — `"auto"` resolves to an undefined
 * `--drawer-size-auto`, which invalidates the height and leaves the sheet
 * filling the screen — so the content height is set here instead.
 */
export const sheet: Record<string, CSSProperties> = {
  content: {
    height: "auto",
    maxHeight: "85dvh",
    borderRadius: `${radiusCard} ${radiusCard} 0 0`,
  },
  body: {
    paddingBottom: "max(var(--mantine-spacing-md), env(safe-area-inset-bottom))",
  },
};
