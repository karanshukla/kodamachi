import { Box, Collapse, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";

import * as styles from "./ShortcutList.styles";

export interface Shortcut {
  label: string;
  /** Written with the literal "Alt"; the ⌘ alternative is rendered in. */
  hint: string;
}

interface ShortcutListProps {
  title: string;
  shortcuts: Shortcut[];
  /**
   * Folds the list behind its own heading, closed until opened. The preferences
   * sheet uses it so the settings above are not pushed off a phone screen.
   */
  collapsible?: boolean;
}

/**
 * Keyboard-shortcut reference, shared by the home page and the Messages
 * preferences panel.
 */
export function ShortcutList({ title, shortcuts, collapsible = false }: ShortcutListProps) {
  const [opened, setOpened] = useState(false);

  const rows = (
    <Stack gap={6}>
      {shortcuts.map(({ label, hint }) => (
        <Box key={label} style={styles.row}>
          <Text fz={13}>{label}</Text>
          <Text fz={12} c="dimmed">
            {hint.replace("Alt", "Alt/⌘") /* i18n-allow */}
          </Text>
        </Box>
      ))}
    </Stack>
  );

  if (!collapsible) {
    return (
      <>
        <Title order={2} style={styles.heading}>
          {title}
        </Title>
        {rows}
      </>
    );
  }

  return (
    <>
      <Title order={2} tt="uppercase" style={styles.disclosureHeading}>
        <UnstyledButton
          aria-expanded={opened}
          style={styles.disclosure}
          onClick={() => setOpened((open) => !open)}
        >
          {title}
          <IconChevronDown size={14} style={styles.chevron(opened)} />
        </UnstyledButton>
      </Title>
      <Collapse expanded={opened}>
        <Box style={styles.rows}>{rows}</Box>
      </Collapse>
    </>
  );
}
