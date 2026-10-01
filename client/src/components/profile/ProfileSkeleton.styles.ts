import type { CSSProperties } from "react";

import { profileCardFill } from "../../lib/themes";

import { card } from "./AskCard.styles";

export const body: CSSProperties = {
  padding: "0 24px 18px",
  position: "relative",
};

export const askCard: CSSProperties = card(profileCardFill(null), false);
