import { Box, Button, CopyButton, Group, Paper, Text, Tooltip } from "@mantine/core";
import { IconClipboard } from "@tabler/icons-react";
import { useHaptic } from "use-haptic";

import { useTranslations } from "../../lib/i18n";
import { warmOgCard } from "../../lib/ogWarm";
import { heroOutlineButton } from "../../styles/tokens";
import ShareButton from "../ShareButton";

import * as styles from "./InboxLinkCard.styles";

interface InboxLinkCardProps {
  /** Display form, e.g. "fragen.navy/karan.bsky.social". */
  shortUrl: string;
  fullUrl: string;
  /** Whose OG card to warm — copying or sharing means a crawler is coming. */
  handle: string;
  shareData: { title: string; text: string; url: string };
}

export function InboxLinkCard({ shortUrl, fullUrl, handle, shareData }: InboxLinkCardProps) {
  const { triggerHaptic } = useHaptic(1);
  const messages = useTranslations();
  const warmShareTarget = () => warmOgCard(handle);

  return (
    <Paper mb="md" style={styles.card}>
      <Group align="center" gap="md" wrap="wrap">
        <Box style={{ flex: 1, minWidth: 200 }}>
          <Text mb={7} style={styles.eyebrow}>
            {messages.inboxLinkCard.eyebrow}
          </Text>
          <Text fw={600} fz={18} style={styles.url}>
            {shortUrl}
          </Text>
        </Box>
        <Group gap="xs" wrap="wrap">
          <CopyButton value={fullUrl}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? messages.common.copied : messages.common.copyLink} withArrow>
                <Button
                  onClick={() => {
                    triggerHaptic();
                    copy();
                    warmShareTarget();
                  }}
                  size="sm"
                  radius="md"
                  variant="default"
                  leftSection={<IconClipboard size={16} />}
                  style={heroOutlineButton}
                >
                  {copied ? messages.common.copied : messages.common.copy}
                </Button>
              </Tooltip>
            )}
          </CopyButton>
          <ShareButton shareData={shareData} onSuccess={warmShareTarget} />
        </Group>
      </Group>
    </Paper>
  );
}
