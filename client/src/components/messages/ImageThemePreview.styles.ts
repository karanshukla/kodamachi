import type { CSSProperties } from "react";

import { fillInk, fillMidnight } from "../../styles/tokens";

/**
 * Miniature mockups of the three image-export themes.
 *
 * These deliberately do NOT use app tokens beyond the two fills: they depict
 * what the rendered PNG looks like, which is a fixed artefact that does not
 * follow the viewer's colour scheme. Treating them as themeable UI would make
 * the preview lie about the output.
 */

const bar = (height: number, background: string, extra?: CSSProperties): CSSProperties => ({
  height,
  background,
  borderRadius: 2,
  ...extra,
});

/* ── quote: white card on the navy fill ── */

export const defaultRoot: CSSProperties = {
  background: fillInk,
  height: "100%",
  borderRadius: 6,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  justifyContent: "center",
  padding: 10,
  gap: 7,
};

export const centered: CSSProperties = { display: "flex", justifyContent: "center" };
export const defaultHeading = bar(3, "rgba(255,255,255,0.55)", { width: "55%" });
export const defaultQuote: CSSProperties = {
  background: "#ffffff",
  borderRadius: 5,
  padding: "7px 8px",
};
export const defaultQuoteLine = bar(3, "#c9d2e1", { marginBottom: 4 });
export const defaultQuoteLineShort = bar(3, "#c9d2e1", { width: "65%" });
export const defaultFooter = bar(2, "rgba(255,255,255,0.35)", { width: "40%" });

/* ── compact: white-ruled block on midnight ── */

export const compressedRoot: CSSProperties = {
  background: fillMidnight,
  height: "100%",
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  padding: 10,
};
export const compressedBlock: CSSProperties = {
  background: "#101e3c",
  borderLeft: "3px solid #ffffff",
  borderRadius: 5,
  padding: 8,
  width: "100%",
};
export const compressedTitle = bar(3, "rgba(255,255,255,0.7)", {
  borderRadius: 2,
  marginBottom: 5,
  width: "45%",
});
export const compressedLine = bar(3, "rgba(255,255,255,0.28)", {
  borderRadius: 2,
  marginBottom: 3,
});
export const compressedLineShort = bar(3, "rgba(255,255,255,0.28)", {
  borderRadius: 2,
  width: "70%",
});
export const compressedMeta = bar(2.5, "rgba(255,255,255,0.28)", { width: "45%", marginTop: 5 });

/* ── post: paper card with the mark as avatar ── */

export const twitterRoot: CSSProperties = {
  background: "#f1f4f9",
  height: "100%",
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  padding: 10,
};
export const twitterCard: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #c9d5ea",
  borderRadius: 5,
  padding: 8,
  width: "100%",
};
export const twitterHeader: CSSProperties = {
  display: "flex",
  gap: 5,
  marginBottom: 5,
  alignItems: "center",
};
export const twitterAvatar: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "#10224a",
  flexShrink: 0,
};
export const twitterName = bar(2.5, "#333f55", { marginBottom: 2 });
export const twitterHandle = bar(2.5, "#b9c2d2", { width: "55%" });
export const twitterLine = bar(2.5, "#c9d2e1", { marginBottom: 3 });
export const twitterLineShort = bar(2.5, "#c9d2e1", { width: "75%", marginBottom: 4 });
export const twitterRule: CSSProperties = { height: 1, background: "#eef1f6", marginBottom: 3 };
export const twitterAction = bar(2.5, "#234b94", { width: "40%" });
