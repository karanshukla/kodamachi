import { APP_NAME } from "../lib/brand";
import { BrandMark } from "./BrandMark";

import * as styles from "./Wordmark.styles";

interface WordmarkProps {
  size?: number;
  showMark?: boolean;
}

/** The lockup: 木 tile beside the lowercase wordmark, one tone. */
export function Wordmark({ size = 17, showMark = true }: WordmarkProps) {
  return (
    <span style={styles.lockup}>
      {showMark && <BrandMark size={size + 13} aria-hidden />}
      <span style={styles.name(size)}>{APP_NAME}</span>
    </span>
  );
}
