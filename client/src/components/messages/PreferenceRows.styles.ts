import type { CSSProperties } from "react";

import { border } from "../../styles/tokens";

export const row = (last: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
  padding: "10px 0",
  borderBottom: last ? undefined : border,
});

export const text: CSSProperties = {
  flex: 1,
  minWidth: 0,
};
