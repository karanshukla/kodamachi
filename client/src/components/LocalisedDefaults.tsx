import { MantineThemeProvider } from "@mantine/core";
import { useMemo } from "react";

import { useTranslations } from "../lib/i18n";

/**
 * Mantine's close buttons have no accessible name unless each call site passes
 * one. This gives every Modal, Alert and Notification below it the translated
 * label once, including toasts rendered through the Notifications portal.
 */
export function LocalisedDefaults({ children }: { children: React.ReactNode }) {
  const messages = useTranslations();
  const theme = useMemo(() => {
    const closeButtonProps = { "aria-label": messages.common.close };
    return {
      components: {
        Modal: { defaultProps: { closeButtonProps } },
        Notification: { defaultProps: { closeButtonProps } },
        Alert: { defaultProps: { closeButtonLabel: messages.common.close } },
      },
    };
  }, [messages]);
  return <MantineThemeProvider theme={theme}>{children}</MantineThemeProvider>;
}
