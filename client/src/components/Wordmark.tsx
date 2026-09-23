import { APP_NAME } from "../lib/brand";

import * as styles from "./Wordmark.styles";

interface WordmarkProps {
  size?: number;
}

/** The lowercase wordmark, one tone. */
export function Wordmark({ size = 17 }: WordmarkProps) {
  return <span style={styles.name(size)}>{APP_NAME}</span>;
}
