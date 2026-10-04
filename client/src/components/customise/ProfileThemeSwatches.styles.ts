import type { CSSProperties } from "react";

import type { ProfileCardFill } from "../../lib/themes";
import { border } from "../../styles/tokens";

/**
 * One row, like the image-theme picker: equal columns that shrink with the card.
 * The cap keeps swatches swatch-sized on a full-width row.
 *
 * @see [ProfileThemeSwatches.test.tsx](../../tests/components/ProfileThemeSwatches.test.tsx)
 * — pins the single row, which is what keeps this card level with the prompt
 * card sharing its row.
 */
export const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 150px))",
  gap: 12,
};

/** Every swatch carries a hairline: one preset always matches the card behind it. */
export const fill = (theme: ProfileCardFill): CSSProperties => ({
  height: "100%",
  background: theme.background,
  border,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});
