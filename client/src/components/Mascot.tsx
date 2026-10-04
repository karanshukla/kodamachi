import type { CSSProperties } from "react";

import * as styles from "./Mascot.styles";

export type MascotPose = "greeting" | "idle" | "empty-handed" | "sprout";

interface MascotProps {
  pose: MascotPose;
  size: number;
  /** Plays a single hop on mount, for the moment something just happened. */
  hop?: boolean;
  style?: CSSProperties;
}

/** A full-colour cut-out; the artwork's own outline carries it on both schemes. */
export function Mascot({ pose, size, hop, style }: MascotProps) {
  return (
    <img
      src={styles.spriteUrl(pose)}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className={hop ? "ds-mascot-hop" : undefined}
      style={{ ...styles.frame(size), ...style }}
    />
  );
}
