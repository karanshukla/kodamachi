import { Paper, Stack } from "@mantine/core";

import * as styles from "./AuthPanel.styles";

/**
 * The bordered card shared by the login form and the OAuth callback so
 * the redirect round trip does not visibly change surface.
 */
export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <Paper radius="xl" p={32} withBorder style={styles.panel}>
      <Stack gap="md">{children}</Stack>
    </Paper>
  );
}
