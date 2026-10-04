import { APP_NAME } from "../lib/brand";

interface BrandMarkProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
}

/** The sprout bulb on its own, with no tile behind it. */
export function BrandMark({
  size = 40,
  className,
  style,
  "aria-hidden": ariaHidden,
}: BrandMarkProps) {
  return (
    <img
      src="/mascot/sprout-mark.webp"
      width={size}
      height={size}
      alt={ariaHidden ? "" : APP_NAME}
      aria-hidden={ariaHidden}
      draggable={false}
      className={className}
      style={{ flexShrink: 0, ...style }}
    />
  );
}
