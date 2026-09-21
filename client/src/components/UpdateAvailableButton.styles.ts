import type { CSSProperties } from "react";

import { selectedBg, selectedBorder } from "../styles/tokens";

/** The design's "Update" control: a tint chip with a hairline. */
export const chip: CSSProperties = {
  border: `1px solid ${selectedBorder}`,
  background: selectedBg,
};

/**
 * The icon sits in the label rather than a left section, whose margin would
 * push it off-centre on a phone, where the chip is the icon alone.
 */
export const iconAndLabel = { label: { gap: 6 } } as const;
