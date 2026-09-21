import { ActionIcon, Alert, Button, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { IconCircleCheck, IconSend, IconX } from "@tabler/icons-react";
import { useHaptic } from "use-haptic";

import { useTranslations } from "../../lib/i18n";
import type { ProfileCardFill } from "../../lib/themes";
import type { TouchpointTranslations } from "../../lib/touchpointTranslations";
import { useNumberFormat } from "../../lib/useNumberFormat";
import { Mascot } from "../Mascot";

import * as styles from "./AskCard.styles";

interface AskCardProps {
  fill: ProfileCardFill;
  headline: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  /** False when the owner has closed their inbox; the composer is replaced. */
  open: boolean;
  /** True after a message went through; the composer is replaced by the confirmation. */
  sent: boolean;
  onSendAnother: () => void;
  error: string | null;
  /** True when `error` came back from the server rather than from validation. */
  sendFailed: boolean;
  onDismissError: () => void;
  translations: TouchpointTranslations;
  cardRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/** The anonymous-question composer: a filled card with a paper input. */
export function AskCard({
  fill,
  headline,
  maxLength,
  value,
  onChange,
  onSend,
  sending,
  open,
  sent,
  onSendAnother,
  error,
  sendFailed,
  onDismissError,
  translations,
  cardRef,
  textareaRef,
}: AskCardProps) {
  const { triggerHaptic } = useHaptic(1);
  const messages = useTranslations();
  const formatNumber = useNumberFormat();
  const composing = open && !sent;

  return (
    <Paper
      ref={cardRef}
      onClick={composing ? () => textareaRef.current?.focus() : undefined}
      style={styles.card(fill, composing)}
    >
      {!sent && (
        <Text component="h2" fw={600} mb="lg" ta="center" fz={21} style={styles.headline}>
          {headline}
        </Text>
      )}

      <Stack gap="xs">
        {error && (
          <Alert
            color="red"
            title={sendFailed ? messages.publicProfilePage.sendFailedTitle : undefined}
            withCloseButton
            onClose={onDismissError}
            role="alert"
          >
            {error}
          </Alert>
        )}
        {!open ? (
          <>
            <Mascot mood="neutral" size={104} />
            <Text ta="center" fz={14} style={styles.closedNotice}>
              {translations.inboxClosed}
            </Text>
          </>
        ) : sent ? (
          <div role="status" style={styles.sentState}>
            <Mascot
              mood="success"
              size={104}
              fallback={<IconCircleCheck size={32} stroke={1.5} aria-hidden />}
            />
            <Text fw={600} fz={18}>
              {messages.publicProfilePage.messageSentTitle}
            </Text>
            <Text fz={14} style={styles.sentBody}>
              {messages.publicProfilePage.messageSentBody}
            </Text>
            <Button
              mt="sm"
              variant={styles.sendButtonVariant(fill)}
              style={styles.sendButton(fill)}
              onClick={() => {
                triggerHaptic();
                onSendAnother();
              }}
            >
              {messages.publicProfilePage.sendAnother}
            </Button>
          </div>
        ) : (
          <>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
              minRows={2}
              maxRows={4}
              autosize
              disabled={sending}
              aria-label={headline}
              placeholder={translations.placeholder}
              description={`${formatNumber(value.length)}/${formatNumber(maxLength)}`}
              inputWrapperOrder={["input", "description"]}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (e.shiftKey || e.altKey || e.metaKey) return;
                e.preventDefault();
                onSend();
              }}
              radius="md"
              styles={styles.textarea}
            />
            <Group justify="flex-end" gap="xs">
              <ActionIcon
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic();
                  onChange("");
                }}
                variant="default"
                size={40}
                radius="md"
                aria-label={messages.askCard.clearMessage}
                style={styles.clearButton}
              >
                <IconX size={18} />
              </ActionIcon>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic();
                  onSend();
                }}
                loading={sending}
                radius="md"
                leftSection={<IconSend size={16} />}
                variant={styles.sendButtonVariant(fill)}
                style={styles.sendButton(fill)}
              >
                {translations.sendLabel}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}
