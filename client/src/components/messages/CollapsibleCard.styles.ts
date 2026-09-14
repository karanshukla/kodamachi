import type { CSSProperties } from "react";

import { border, radiusCard, surface } from "../../styles/tokens";

export const card: CSSProperties = {
  borderRadius: radiusCard,
  overflow: "hidden",
  background: surface,
  border,
};

export const header: CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  userSelect: "none",
};

export const summary: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

export const chevron = (open: boolean): CSSProperties => ({
  transition: "transform var(--ds-dur-base) var(--ds-ease)",
  transform: open ? "rotate(180deg)" : "rotate(0deg)",
  color: "var(--mantine-color-dimmed)",
});

export const body: CSSProperties = {
  borderTop: border,
};
