import type { CSSProperties } from "react";

import type { ProfileCardFill } from "../../lib/themes";
import {
  border,
  onFill,
  onFillBorder,
  onFillButton,
  onFillMuted,
  onPaper,
  onPaperMuted,
  radiusCard,
  radiusControl,
} from "../../styles/tokens";

/**
 * The card publishes its foreground as `--ds-card-*` custom properties, the
 * same contract QuestionCard uses, so the headline, counter and buttons follow
 * whichever fill the owner picked. Every fill keeps its colour in both schemes,
 * so the foregrounds are the fixed on-fill and on-paper tokens, never the
 * scheme-aware text colours.
 */
function foreground(fill: ProfileCardFill): CSSProperties {
  return (
    fill.paper
      ? {
          "--ds-card-fg": onPaper,
          "--ds-card-fg-muted": onPaperMuted,
          "--ds-card-edge": "var(--ds-compose-border)",
          "--ds-card-input-bg": "var(--ds-compose-bg)",
        }
      : {
          "--ds-card-fg": onFill,
          "--ds-card-fg-muted": onFillMuted,
          "--ds-card-edge": onFillBorder,
          "--ds-card-input-bg": "var(--ds-fill-paper)",
        }
  ) as CSSProperties;
}

/** Every preset carries a hairline: one of them always matches the page behind it. */
export const card = (fill: ProfileCardFill, composing: boolean): CSSProperties => ({
  ...foreground(fill),
  borderRadius: radiusCard,
  padding: "30px 28px",
  background: fill.background,
  border,
  cursor: composing ? "text" : undefined,
  position: "relative",
  overflow: "hidden",
});

export const headline: CSSProperties = {
  color: "var(--ds-card-fg)",
  letterSpacing: "-0.015em",
};

/** The input is a paper well on a navy card, and a canvas well on the paper one. */
export const textarea = {
  input: {
    backgroundColor: "var(--ds-card-input-bg)",
    color: "var(--ds-compose-fg)",
    border: "1px solid var(--ds-card-edge)",
    borderRadius: radiusControl,
    padding: "14px 16px",
    fontSize: 15,
  },
  description: {
    color: "var(--ds-card-fg-muted)",
    fontSize: 12,
    textAlign: "left" as const,
    marginTop: 12,
  },
} as const;

export const clearButton: CSSProperties = {
  border: "1px solid var(--ds-card-edge)",
  color: "var(--ds-card-fg)",
  background: "transparent",
  width: 40,
  height: 40,
};

/** White with navy text on a dark fill; the ordinary navy button on paper. */
export const sendButton = (fill: ProfileCardFill): CSSProperties =>
  fill.paper ? { height: 40 } : { ...onFillButton, height: 40 };

/** Mantine's `default` variant carries the white on-fill button; `filled` is navy. */
export const sendButtonVariant = (fill: ProfileCardFill): "default" | "filled" =>
  fill.paper ? "filled" : "default";

export const closedNotice: CSSProperties = {
  color: "var(--ds-card-fg-muted)",
  border: "1px dashed var(--ds-card-edge)",
  borderRadius: radiusControl,
  padding: 16,
  lineHeight: 1.5,
};

export const sentState: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  textAlign: "center",
  color: "var(--ds-card-fg)",
};

export const sentBody: CSSProperties = {
  color: "var(--ds-card-fg-muted)",
};
