import type { CSSProperties } from "react";

export function frame(size: number): CSSProperties {
  return {
    display: "block",
    width: size,
    height: size,
    margin: "0 auto",
  };
}

export const spriteUrl = (pose: string) => `/mascot/${pose}.webp`;
