import { Box, Button } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useState, useSyncExternalStore } from "react";
import { useHaptic } from "use-haptic";

import { useTranslations } from "../lib/i18n";
import { applyUpdate, isUpdateReady, subscribeToUpdate } from "../lib/swUpdate";

import * as styles from "./UpdateAvailableButton.styles";

export function UpdateAvailableButton() {
  const updateReady = useSyncExternalStore(subscribeToUpdate, isUpdateReady, isUpdateReady);
  // Applying swaps the waiting worker in and reloads the page, which takes long
  // enough to look like nothing happened. The state only has to outlive the
  // click: the reload tears the component down. The label stays put under the
  // spinner, so the header does not reflow in the moment before the reload.
  const [applying, setApplying] = useState(false);
  const { triggerHaptic } = useHaptic(1);
  const messages = useTranslations();

  if (!updateReady) return null;

  return (
    <Button
      onClick={() => {
        triggerHaptic();
        setApplying(true);
        applyUpdate();
      }}
      loading={applying}
      disabled={applying}
      size="xs"
      px={{ base: 7, xs: 14 }}
      radius="xl"
      variant="light"
      color="accent"
      style={styles.chip}
      styles={styles.iconAndLabel}
      aria-label={
        applying
          ? messages.updateAvailableButton.applyingAriaLabel
          : messages.updateAvailableButton.ariaLabel
      }
    >
      <IconRefresh size={14} aria-hidden />
      <Box component="span" visibleFrom="xs">
        {messages.updateAvailableButton.buttonLabel}
      </Box>
    </Button>
  );
}
