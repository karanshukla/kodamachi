import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconShare } from "@tabler/icons-react";
import React from "react";
import { useHaptic } from "use-haptic";

import { useTranslations } from "../lib/i18n";

import * as styles from "./ShareButton.styles";

interface ShareButtonProps {
  shareData: {
    title?: string;
    text?: string;
    url?: string;
    files?: File[];
  };
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

const ShareButton = ({ shareData, onSuccess, onError }: ShareButtonProps) => {
  const { triggerHaptic } = useHaptic(1);
  const messages = useTranslations();
  const handleClick = async () => {
    triggerHaptic();
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        if (onSuccess) onSuccess();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (onError) onError(error);
      }
    } else if (navigator.clipboard && shareData.url) {
      try {
        await navigator.clipboard.writeText(shareData.url);
        notifications.show({
          color: "primary",
          title: messages.shareButton.linkCopiedTitle,
          message: messages.shareButton.linkCopiedMessage,
        });
        if (onSuccess) onSuccess();
      } catch (error) {
        notifications.show({
          color: "red",
          title: messages.shareButton.copyFailedTitle,
          message: messages.shareButton.copyFailedMessage,
        });
        if (onError) onError(error);
      }
    } else {
      notifications.show({
        color: "yellow",
        title: messages.shareButton.sharingUnavailableTitle,
        message: messages.shareButton.sharingUnavailableMessage,
      });
    }
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="transparent"
      leftSection={<IconShare size={14} />}
      style={styles.button}
    >
      {messages.shareButton.button}
    </Button>
  );
};

export default ShareButton;
