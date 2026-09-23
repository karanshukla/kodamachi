import type { CSSProperties } from "react";

import { disclosureChevron } from "../styles/controls.styles";
import { eyebrow, textDimmed } from "../styles/tokens";

export const heading: CSSProperties = {
  ...eyebrow,
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
  ...disclosureChevron(open),
  color: textDimmed,
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
