import type { CSSProperties } from "react";

import { heroButton, heroOutlineButton } from "../styles/tokens";

/** Solid for the primary action on a hero surface; the outline otherwise. */
export const button = (solid: boolean): CSSProperties => (solid ? heroButton : heroOutlineButton);
