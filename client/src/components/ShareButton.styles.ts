import type { CSSProperties } from "react";

import { onFillButton, onFillOutlineButton } from "../styles/tokens";

/** Solid white for the primary action on a fill; the outline otherwise. */
export const button = (solid: boolean): CSSProperties =>
  solid ? onFillButton : onFillOutlineButton;
