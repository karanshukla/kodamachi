import type { CSSProperties } from "react";

import {
  accentText,
  heroBg,
  link,
  onHero,
  radiusCard,
  surface,
  textDimmed,
} from "../styles/tokens";

export const title: CSSProperties = {
  textWrap: "pretty",
};

export const subtitle: CSSProperties = {
  lineHeight: 1.6,
};

export const infoCard: CSSProperties = {
  background: surface,
};

/** Uppercase eyebrow, not a display heading. */
export const infoHeading: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  color: textDimmed,
  marginBottom: 14,
};

export const disclaimer: CSSProperties = {
  lineHeight: 1.55,
};

/** The welcome card is the one hero surface on the page. */
export const hero: CSSProperties = {
  padding: "40px 32px",
  textAlign: "center",
  background: heroBg,
  borderRadius: radiusCard,
  color: onHero,
};

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
