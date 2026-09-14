import type { CSSProperties } from "react";

import { selectedBg, selectedBorder } from "../styles/tokens";

/** The design's "Update" control: a tint chip with a hairline. */
export const chip: CSSProperties = {
  border: `1px solid ${selectedBorder}`,
  background: selectedBg,
};
