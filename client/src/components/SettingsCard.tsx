import { Group, Paper, Text } from "@mantine/core";

import * as styles from "./SettingsCard.styles";

interface SettingsCardProps {
  title: string;
  description: string;
  control?: React.ReactNode;
  note?: string;
  children?: React.ReactNode;
}

/**
 * Owns the card surface and the one layout rule the settings pages follow:
 * state sits next to the title, the action sits at the bottom edge.
 *
 * @see [SettingsCard.test.tsx](../tests/components/SettingsCard.test.tsx) — pins
 * that the card fills its column, so cards in different rows share edges.
 */
export function SettingsCard({ title, description, control, note, children }: SettingsCardProps) {
  return (
    <Paper withBorder style={styles.card}>
      <Group justify="space-between" align="center" wrap="nowrap" gap="sm" style={styles.header}>
        <Text component="h2" fw={600} fz={16}>
          {title}
        </Text>
        {control}
      </Group>
      <div style={styles.body}>
        <Text c="dimmed" fz={13} style={styles.description}>
          {description}
        </Text>
        {note && (
          <Text c="dimmed" fz={12} style={styles.note}>
            {note}
          </Text>
        )}
      </div>
      {children}
    </Paper>
  );
}
