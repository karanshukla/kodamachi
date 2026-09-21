import type { CSSProperties } from "react";

import { eyebrow as eyebrowLabel } from "../../styles/tokens";

const SECTION_GAP = 34;

export const section = (last?: boolean): CSSProperties => ({
  marginBottom: last ? 0 : SECTION_GAP,
});

export const eyebrow: CSSProperties = eyebrowLabel;
