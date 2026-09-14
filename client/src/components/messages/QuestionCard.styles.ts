import type { CSSProperties } from "react";

import {
  borderColor,
  heroBg,
  heroOutlineButton,
  onHero,
  onHeroEdge,
  onHeroFaint,
  onHeroMuted,
  onHeroWash,
  radiusCard,
  selectedBg,
  surface,
  textDefault,
  textDimmed,
} from "../../styles/tokens";

export interface CardState {
  /** Painted as a hero surface rather than a plain card — the "ink backgrounds" preference. */
  ink: boolean;
  pinned: boolean;
  focused: boolean;
}

/**
 * A question card is painted either as a hero surface or as a plain card, and
 * everything inside it has to follow. Rather than each Text repeating the
 * choice — which is how the message body ended up hard-coded to white and
 * therefore invisible on the light surface — the card publishes its
 * `--ds-card-*` custom properties and its children read those.
 */
function foreground(ink: boolean): CSSProperties {
  return {
    "--ds-card-fg": ink ? onHero : textDefault,
    "--ds-card-fg-muted": ink ? onHeroMuted : textDimmed,
    "--ds-card-fg-faint": ink ? onHeroFaint : textDimmed,
    "--ds-card-accent": ink ? onHero : "var(--ds-link)",
    "--ds-card-edge": ink ? onHeroEdge : borderColor,
    "--ds-card-wash": ink ? onHeroWash : selectedBg,
  } as CSSProperties;
}

/**
 * Hover is a fill, never a lift, so cards carry a hairline and no shadow. The
 * pinned thread root takes the ink border, the card being composed in takes
 * the link border.
 */
function borderFor({ pinned, focused }: CardState): string {
  if (pinned) return "1.5px solid var(--ds-pinned-border)";
  if (focused) return "1.5px solid var(--ds-expanded-border)";
  return "1px solid var(--ds-card-edge)";
}

export const card = (state: CardState): CSSProperties => ({
  ...foreground(state.ink),
  borderRadius: radiusCard,
  background: state.ink ? heroBg : surface,
  border: borderFor(state),
  padding: "10px 20px 20px",
  transition: "border-color var(--ds-dur-fast) var(--ds-ease)",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
});

export const timestamp: CSSProperties = {
  color: "var(--ds-card-fg-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const iconButton = (active: boolean): CSSProperties => ({
  color: active ? "var(--ds-card-action-active)" : "var(--ds-card-fg-muted)",
  transition:
    "color var(--ds-dur-fast) var(--ds-ease), background var(--ds-dur-fast) var(--ds-ease)",
});

export const disabledIconButton: CSSProperties = {
  color: "var(--ds-card-fg-faint)",
  cursor: "not-allowed",
};

export const bodyWrap: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const body: CSSProperties = {
  color: "var(--ds-card-fg)",
  fontSize: 19,
  fontWeight: 600,
  lineHeight: 1.35,
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
  textAlign: "center",
  textWrap: "balance",
  width: "100%",
};

export const threadLink: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  color: "var(--ds-card-accent)",
  textDecoration: "none",
  fontSize: 12,
};

export const threadLinkText: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * "Reply to thread" on the pinned root is the filled primary button; a plain
 * card's "Reply" is the outline. On an ink card both become the hero outline,
 * since the filled primary would match the hero behind it.
 */
export type ReplyVariant = "default" | "filled" | "outline";

export function replyButtonVariant(ink: boolean, inThread: boolean): ReplyVariant {
  if (ink) return "default";
  return inThread ? "filled" : "outline";
}

export const replyButton = (blocked: boolean, ink: boolean): CSSProperties => ({
  ...(ink ? heroOutlineButton : {}),
  height: 44,
  opacity: blocked ? 0.45 : 1,
  cursor: blocked ? "not-allowed" : undefined,
});
