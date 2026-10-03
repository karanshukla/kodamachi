import { Grid, Text } from "@mantine/core";

import * as styles from "./SettingsSection.styles";

interface SettingsSectionProps {
  eyebrow: string;
  last?: boolean;
  children: React.ReactNode;
}

export function SettingsSection({ eyebrow, last, children }: SettingsSectionProps) {
  return (
    <div style={styles.section(last)}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Grid style={{ gap: "var(--mantine-spacing-md)" }}>{children}</Grid>
    </div>
  );
}
