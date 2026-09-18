import { mascotSrc, type MascotMood } from "../lib/mascot";

interface MascotProps {
  mood: MascotMood;
  /** Rendered height in px; width follows the artwork's aspect ratio. */
  size: number;
  /** Shown while there is no artwork for `mood`. */
  fallback?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * The large mascot for empty, loading, error and confirmed states. Decorative:
 * the surrounding copy always carries the meaning, so the image is hidden from
 * assistive tech. Renders `fallback` until the artwork lands in assets/mascot/.
 */
export function Mascot({ mood, size, fallback = null, style }: MascotProps) {
  const src = mascotSrc(mood);
  if (!src) return fallback;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      style={{ display: "block", height: size, width: "auto", margin: "0 auto", ...style }}
    />
  );
}
