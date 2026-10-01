import { Text } from "@mantine/core";

import * as styles from "./SwatchButton.styles";

const MOCKUP_ASPECT = "4/3";

interface SwatchButtonProps {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  previewAspect?: string;
}

export function SwatchButton({
  label,
  selected,
  disabled,
  onClick,
  children,
  previewAspect = MOCKUP_ASPECT,
}: SwatchButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      style={styles.button(selected, disabled)}
    >
      <div style={styles.preview(previewAspect)}>{children}</div>
      <Text component="span" size="xs" fw={600} ta="center" style={styles.label}>
        {label}
      </Text>
    </button>
  );
}
