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

/** Closed, the heading is all there is, so it carries no gap beneath it. */
export const disclosureHeading: CSSProperties = {
  ...heading,
  marginBottom: 0,
};

export const disclosure: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "4px 0",
  color: "inherit",
  font: "inherit",
  textTransform: "inherit",
};

export const chevron = (open: boolean): CSSProperties => ({
  color: textDimmed,
  flex: "none",
  transition: "transform var(--ds-dur-base) var(--ds-ease)",
  transform: open ? "rotate(180deg)" : "rotate(0deg)",
});

export const rows: CSSProperties = {
  paddingTop: 10,
};

export const row: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "4px 0",
};
