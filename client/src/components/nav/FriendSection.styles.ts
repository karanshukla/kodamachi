import type { CSSProperties } from "react";

import { surface } from "../../styles/tokens";

/**
 * Sticky so the group label stays put while its list scrolls under it, and
 * painted the sidebar's own surface so the list does not show through.
 */
export const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  width: "100%",
  cursor: "pointer",
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: surface,
  paddingTop: "var(--mantine-spacing-lg)",
};

/** Section label: small caps, faint, tracked. */
export const label: CSSProperties = {
  flex: 1,
  letterSpacing: "0.1em",
};

export const chevron = (open: boolean): CSSProperties => ({
  color: "var(--mantine-color-dimmed)",
  transition: "transform var(--ds-dur-fast) var(--ds-ease)",
  transform: open ? "rotate(0deg)" : "rotate(-90deg)",
  flexShrink: 0,
});

export const friendLink = {
  root: {
    borderRadius: 10,
    transition: "background var(--ds-dur-fast) var(--ds-ease)",
  },
} as const;
