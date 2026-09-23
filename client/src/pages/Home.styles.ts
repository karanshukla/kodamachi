import type { CSSProperties } from "react";

import { accentText, eyebrow, heroBg, link, onHero } from "../styles/tokens";

export const title: CSSProperties = {
  textWrap: "pretty",
};

export const subtitle: CSSProperties = {
  lineHeight: 1.6,
};

export const infoHeading: CSSProperties = {
  ...eyebrow,
  marginBottom: 14,
};

export const disclaimer: CSSProperties = {
  lineHeight: 1.55,
};

/** The welcome card is the one hero surface on the page. */
export const hero = {
  padding: "40px 32px",
  textAlign: "center",
  background: heroBg,
  color: onHero,
  "--ds-focus-ring": onHero,
} as CSSProperties;

export const greeting: CSSProperties = {
  letterSpacing: "-0.02em",
};

export const sellingPoint: CSSProperties = {
  display: "flex",
  gap: 14,
};

export const bullet: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: accentText,
  marginTop: 7,
  flexShrink: 0,
};

export const sellingPointBody: CSSProperties = {
  lineHeight: 1.55,
};

export const contactLink: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 14,
  fontWeight: 500,
  color: link,
  textDecoration: "none",
};
