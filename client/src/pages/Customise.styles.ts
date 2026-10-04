import type { InputStylesNames, InputWrapperStylesNames } from "@mantine/core";
import type { CSSProperties } from "react";

export const promptCounter: Partial<
  Record<InputStylesNames | InputWrapperStylesNames, CSSProperties>
> = {
  description: { textAlign: "right", marginBottom: 6 },
};
