/**
 * TypeScript handles for the design tokens declared in `src/index.css`.
 *
 * Components import from here rather than typing `var(--ds-…)` inline, so a
 * renamed token is a compile error instead of a colour that silently resolves
 * to nothing. The values are scheme-aware in CSS, which is why none of these
 * take an `isDark` argument — the browser picks.
 */

/** Paper card sitting on the canvas. */
export const surface = "var(--ds-surface)";
/** One step below paper — the canvas — for inset rows and inputs on a card. */
export const surfaceGhost = "var(--ds-surface-ghost)";
/** Keyboard-focus wash on a list row, and the selected swatch. */
export const surfaceHighlight = "var(--ds-surface-highlight)";

export const textDimmed = "var(--mantine-color-dimmed)";
export const textDefault = "var(--mantine-color-text)";
/** Inline links and other accented body text. */
export const link = "var(--ds-link)";
/** Brand-coloured emphasis inside body copy. */
export const accentText = "var(--ds-accent-text)";

export const border = "1px solid var(--mantine-color-default-border)";
export const borderColor = "var(--mantine-color-default-border)";

/** Error headings and failure text, tuned to clear AA on paper. */
export const dangerText = "var(--ds-tone-red)";
export const selectedBg = "var(--ds-selected-bg)";
export const selectedBorder = "var(--ds-selected-border)";

/**
 * Hero surfaces — the welcome card, the inbox link, ink question cards, a
 * banner with no image — and what is painted on them. Navy with white ink in
 * light mode, inverted in dark.
 */
export const heroBg = "var(--ds-hero)";
export const onHero = "var(--ds-on-hero)";
export const onHeroMuted = "var(--ds-on-hero-muted)";
export const onHeroFaint = "var(--ds-on-hero-faint)";
export const onHeroEdge = "var(--ds-on-hero-edge)";
export const onHeroWash = "var(--ds-on-hero-wash)";

/** Foreground colours for a dark ask-card preset, fixed in both schemes. */
export const onFill = "var(--ds-on-fill)";
export const onFillMuted = "var(--ds-on-fill-muted)";
export const onFillBorder = "var(--ds-on-fill-border)";

/** Foreground colours for the paper preset, in either scheme. */
export const onPaper = "var(--ds-on-paper)";
export const onPaperMuted = "var(--ds-on-paper-muted)";

/** Fixed fills, for the image-theme previews. */
export const fillInk = "var(--ds-fill-ink)";
export const fillMidnight = "var(--ds-fill-midnight)";

/** Avatar with no picture: tint fill, navy initials — never a hashed hue. */
export const avatarFallback = {
  placeholder: { background: surfaceHighlight, color: accentText, fontWeight: 600 },
} as const;

/** The mark tile; it inverts with the scheme. */
export const markBg = "var(--ds-mark-bg)";
export const markFg = "var(--ds-mark-fg)";

export const radiusCard = "var(--ds-radius-card)";
export const radiusControl = "var(--ds-radius-control)";
export const radiusPill = "var(--ds-radius-pill)";

/** The primary action on a hero surface: the hero's ink as the button, the hero as its label. */
export const heroButton = {
  background: onHero,
  border: "none",
  "--button-color": heroBg,
} as const;

/** The secondary action on a hero surface: a translucent outline in the hero's ink. */
export const heroOutlineButton = {
  background: "transparent",
  border: `1px solid ${onHeroEdge}`,
  "--button-color": onHero,
} as const;

/** A white button with navy text: the primary action on a dark ask-card preset. */
export const onFillButton = {
  background: onFill,
  border: "none",
  "--button-color": "var(--ds-on-fill-button-fg)",
} as const;
