/**
 * TypeScript handles for the design tokens declared in `src/index.css`.
 *
 * Components import from here rather than typing `var(--ds-…)` inline, so a
 * renamed token is a compile error instead of a colour that silently resolves
 * to nothing. The values are scheme-aware in CSS, which is why none of these
 * take an `isDark` argument — the browser picks.
 */

export const surface = "var(--ds-surface)";
export const surfaceGhost = "var(--ds-surface-ghost)";
export const surfaceHighlight = "var(--ds-surface-highlight)";

export const textDimmed = "var(--mantine-color-dimmed)";
export const textDefault = "var(--mantine-color-text)";
export const link = "var(--ds-link)";
export const accentText = "var(--ds-accent-text)";

export const border = "1px solid var(--mantine-color-default-border)";
export const borderColor = "var(--mantine-color-default-border)";

export const dangerText = "var(--ds-tone-red)";
export const selectedBg = "var(--ds-selected-bg)";
export const selectedBorder = "var(--ds-selected-border)";

export const heroBg = "var(--ds-hero)";
export const onHero = "var(--ds-on-hero)";
export const onHeroMuted = "var(--ds-on-hero-muted)";
export const onHeroFaint = "var(--ds-on-hero-faint)";
export const onHeroEdge = "var(--ds-on-hero-edge)";
export const onHeroWash = "var(--ds-on-hero-wash)";

export const onFill = "var(--ds-on-fill)";
export const onFillMuted = "var(--ds-on-fill-muted)";
export const onFillBorder = "var(--ds-on-fill-border)";

export const onPaper = "var(--ds-on-paper)";
export const onPaperMuted = "var(--ds-on-paper-muted)";

export const fillInk = "var(--ds-fill-ink)";
export const fillMidnight = "var(--ds-fill-midnight)";

export const avatarFallback = {
  placeholder: { background: surfaceHighlight, color: accentText, fontWeight: 600 },
} as const;

export const markBg = "var(--ds-mark-bg)";
export const markFg = "var(--ds-mark-fg)";

export const eyebrow = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: textDimmed,
} as const;

export const radiusCard = "var(--ds-radius-card)";
export const radiusControl = "var(--ds-radius-control)";
export const radiusPill = "var(--ds-radius-pill)";

export const heroButton = {
  background: onHero,
  border: "none",
  "--button-color": heroBg,
} as const;

export const heroOutlineButton = {
  background: "transparent",
  border: `1px solid ${onHeroEdge}`,
  "--button-color": onHero,
} as const;

export const onFillButton = {
  background: onFill,
  border: "none",
  "--button-color": "var(--ds-on-fill-button-fg)",
} as const;
