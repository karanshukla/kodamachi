import type { CSSProperties } from "react";

import { profileCardFill } from "../../lib/themes";

import { card } from "./AskCard.styles";

export const body: CSSProperties = {
  padding: "0 24px 18px",
  position: "relative",
};

/** Same geometry as the real ask card, on the default fill. */
export const askCard: CSSProperties = card(profileCardFill(null), false);
