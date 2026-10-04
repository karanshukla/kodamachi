import { Box, Text } from "@mantine/core";

import { useTranslations } from "../../lib/i18n";
import { PREFERENCE_KEYS, type MessagePreferencesState } from "../../lib/useMessagePreferences";
import { SettingsToggle } from "../SettingsToggle";

import * as styles from "./PreferenceRows.styles";

interface PreferenceRowsProps {
  state: MessagePreferencesState;
}

export function PreferenceRows({ state }: PreferenceRowsProps) {
  const { preferences, setPreference } = state;
  const copy = useTranslations().postingPreferences;

  return (
    <Box>
      {PREFERENCE_KEYS.map((key, index) => (
        <Box key={key} style={styles.row(index === PREFERENCE_KEYS.length - 1)}>
          <Box style={styles.text}>
            <Text fw={600} size="sm">
              {copy[key].label}
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              {copy[key].description}
            </Text>
          </Box>
          <SettingsToggle
            label={copy[key].label}
            checked={preferences[key]}
            onChange={(checked) => setPreference(key, checked)}
          />
        </Box>
      ))}
    </Box>
  );
}
