import { Alert, Box, Button, Center, Loader, Paper, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMailOpened } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHaptic } from "use-haptic";

import { ApiError } from "../api/apiClient";
import { useSession } from "../api/authService";
import {
  useMessages,
  useDeleteMessage,
  useAddExampleMessages,
  Message,
  type ResponseMessageResponse,
} from "../api/messageService";
import { useUserSettings, useUpdateUserSettings } from "../api/settingsService";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { InboxLinkCard } from "../components/messages/InboxLinkCard";
import { MessagePreferencesBar } from "../components/messages/MessagePreferencesBar";
import { QuestionGrid } from "../components/messages/QuestionGrid";
import { postedAnswerLink } from "../lib/waypointClients";
import { resolveApiErrorMessage } from "../lib/i18n/apiErrors";
import { useTranslations } from "../lib/i18n";
import { usePageTitle } from "../lib/usePageTitle";
import { getTouchpointTranslations } from "../lib/touchpointTranslations";
import { useMessagePreferences } from "../lib/useMessagePreferences";
import { useReplyComposer } from "../lib/useReplyComposer";
import { useThreadRoot } from "../lib/useThreadRoot";
import * as styles from "./Messages.styles";

const SHORTLINK_URL = import.meta.env.VITE_SHORTLINK_URL || "localhost:5173/profile";

const MESSAGE_REFETCH_INTERVAL_MS = 10000;

const MAX_BSKY_POST_LENGTH = 280;
/** Slack against Bluesky's own grapheme counting, which is not this one. */
const POST_LENGTH_SAFETY_MARGIN = 3;
/** How the question is quoted into the post when it is not sent as an image. */
const quotedQuestion = (message: string) =>
  ` \\n\\nAnon asked via 💙📩❓: *${message}*`; /* i18n-allow: budget-only, mirrors the server's own quoting, never rendered by this client */

export default function Messages() {
  const { triggerHaptic } = useHaptic(1);
  const messages = useTranslations();
  usePageTitle(messages.messagesPage.heading);
  const { data: session, isLoading: sessionLoading } = useSession();
  const prefs = useMessagePreferences();
  const { appendProfileLink, useGradients, includeQuestionAsImage, confirmBeforeDelete } =
    prefs.preferences;

  const {
    data: messagesData,
    isLoading: messagesLoading,
    refetch: refetchMessages,
  } = useMessages(session?.did || null, {
    refetchInterval: MESSAGE_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const thread = useThreadRoot(session?.did, messagesData?.messages);

  const { mutate: deleteMessage, isPending: deleteLoading } = useDeleteMessage();
  const { mutate: addExamples, isPending: examplesLoading } = useAddExampleMessages();

  const { data: userSettings, isLoading: settingsLoading } = useUserSettings();
  const updateSettings = useUpdateUserSettings({
    onError: (error: ApiError) => {
      notifications.show({
        title: messages.messagesPage.themeUpdateErrorTitle,
        message: resolveApiErrorMessage(error, messages),
        color: "red",
      });
    },
  });

  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [messageIdToDelete, setMessageIdToDelete] = useState<string | null>(null);
  const [deletingTid, setDeletingTid] = useState<string | null>(null);

  const handle = session?.profile?.handle ?? "";
  const shortUrl = `${SHORTLINK_URL}/${handle}`;

  const composer = useReplyComposer({
    messages: messagesData?.messages,
    thread,
    imageTheme: userSettings?.imageTheme,
    includeQuestionAsImage,
    appendProfileLink,
    shortUrl,
    handle,
    renderPostedNotice: useCallback(
      (posted: ResponseMessageResponse, inThread: boolean) => (
        <PostedNotice
          link={postedAnswerLink(
            posted.uri,
            posted.link,
            session?.profile?.handle,
            userSettings?.defaultClient ?? null
          )}
          inThread={inThread}
        />
      ),
      [session?.profile?.handle, userSettings?.defaultClient]
    ),
    onPosted: refetchMessages,
  });

  const characterLimitFor = (message: Message) => {
    let budget = MAX_BSKY_POST_LENGTH - POST_LENGTH_SAFETY_MARGIN;
    if (appendProfileLink && handle) budget -= ` ${shortUrl}`.length;
    if (!includeQuestionAsImage) budget -= quotedQuestion(message.message).length;
    return Math.max(0, budget);
  };

  useWelcomeBackToast();
  useScrollToNewMessages(messagesData?.messages, prefs.preferences.autoScrollToMessages);

  const handleAddExampleMessages = () => {
    if (!session?.did) return;
    addExamples(session.did, {
      onSuccess: () => refetchMessages(),
      onError: (err) => {
        notifications.show({
          title: messages.messagesPage.addExamplesErrorTitle,
          message: resolveApiErrorMessage(err, messages),
          color: "red",
        });
      },
    });
  };

  const performDelete = (tid: string, fromModal = false) => {
    const closeModal = () => {
      if (!fromModal) return;
      setDeleteModalOpened(false);
      setMessageIdToDelete(null);
    };
    setDeletingTid(tid);
    deleteMessage(tid, {
      onSuccess: () => {
        if (composer.respondingTid === tid) composer.close();
        closeModal();
        refetchMessages().finally(() => setDeletingTid(null));
      },
      onError: (err) => {
        notifications.show({
          title: messages.messagesPage.deleteErrorTitle,
          message: resolveApiErrorMessage(err, messages),
          color: "red",
        });
        closeModal();
        setDeletingTid(null);
      },
    });
  };

  const handleDeleteRequest = (tid: string) => {
    if (confirmBeforeDelete) {
      setMessageIdToDelete(tid);
      setDeleteModalOpened(true);
      return;
    }
    performDelete(tid);
  };

  const messageCount = messagesData?.messages?.length ?? 0;

  if (sessionLoading) {
    return (
      <Center>
        <Loader size="xl" />
      </Center>
    );
  }

  if (!session?.isLoggedIn) {
    return (
      <Alert color="red" title={messages.messagesPage.notLoggedInTitle}>
        {messages.messagesPage.notLoggedInMessage}
      </Alert>
    );
  }

  const ownerName = session.profile?.displayName || session.profile?.handle || "";
  // Localised because this text leaves the DOM into a tweet/DM, where Google
  // Translate cannot reach it (#266).
  const touchpoint = getTouchpointTranslations(userSettings?.touchpointLocale);

  return (
    <Box maw={1080}>
      <Title order={1} mb="lg">
        {messages.messagesPage.heading}
      </Title>

      <InboxLinkCard
        shortUrl={shortUrl}
        fullUrl={`https://${shortUrl}`}
        handle={handle}
        shareData={{
          title: touchpoint.inboxShareTitle,
          text: touchpoint.inboxShareText(ownerName),
          url: `https://${shortUrl}`,
        }}
      />

      {messagesLoading ? (
        <Center>
          <Loader size="lg" />
        </Center>
      ) : messageCount > 0 ? (
        <>
          <Box mb="lg">
            <MessagePreferencesBar
              state={prefs}
              imageTheme={settingsLoading ? null : (userSettings?.imageTheme ?? null)}
              imageThemeDisabled={settingsLoading || updateSettings.isSaving("imageTheme")}
              onSelectImageTheme={(imageTheme) => updateSettings.save({ imageTheme })}
            />
          </Box>

          <QuestionGrid
            messages={thread.ordered}
            thread={thread}
            ink={useGradients}
            respondingTid={composer.respondingTid}
            onExpand={composer.open}
            onCollapse={composer.close}
            responseText={composer.responseText}
            onResponseTextChange={composer.setResponseText}
            characterLimitFor={characterLimitFor}
            onSend={composer.send}
            sending={composer.sending}
            awaitingRender={composer.awaitingRender}
            includesImage={includeQuestionAsImage}
            deletingTid={deletingTid}
            onDelete={handleDeleteRequest}
            onTogglePin={(tid) => {
              triggerHaptic();
              thread.togglePin(tid);
            }}
            handle={session?.profile?.handle}
            defaultClientId={userSettings?.defaultClient ?? null}
          />
        </>
      ) : (
        <Paper withBorder p={40} ta="center">
          <div style={styles.emptyIcon}>
            <IconMailOpened size={26} stroke={1.5} />
          </div>
          <Text fw={600} fz={18}>
            {messages.messagesPage.noMessagesTitle}
          </Text>
          <Text c="dimmed" fz={14} mt={6} maw={340} mx="auto" style={styles.emptyBody}>
            {messages.messagesPage.noMessagesBody}
          </Text>
          <Button
            mt={22}
            onClick={() => {
              triggerHaptic();
              handleAddExampleMessages();
            }}
            loading={examplesLoading}
            radius="md"
            variant="outline"
          >
            {messages.messagesPage.addExampleMessages}
          </Button>
        </Paper>
      )}

      <ConfirmationModal
        opened={deleteModalOpened}
        onClose={() => {
          if (!deleteLoading) {
            setDeleteModalOpened(false);
            setMessageIdToDelete(null);
          }
        }}
        onConfirm={() => performDelete(messageIdToDelete!, true)}
        title={messages.messagesPage.deleteConfirmTitle}
        message={messages.messagesPage.deleteConfirmMessage}
        confirmLabel={messages.common.delete}
        cancelLabel={messages.common.cancel}
        destructive
        loading={deletingTid !== null && deletingTid === messageIdToDelete}
      />
    </Box>
  );
}

function PostedNotice({ link, inThread }: { link?: string; inThread: boolean }) {
  const messages = useTranslations();
  const summary = inThread
    ? messages.messagesPage.threadReplyPosted
    : messages.messagesPage.responsePosted;
  if (!link) return <>{summary}</>;
  return (
    <>
      {summary}{" "}
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        style={{ color: "inherit", textDecoration: "underline" }}
      >
        {link}
      </a>
    </>
  );
}

/** One-shot greeting after the OAuth round trip lands back on this page. */
function useWelcomeBackToast() {
  const messages = useTranslations();
  useEffect(() => {
    if (sessionStorage.getItem("newLogin") !== "true") return;
    notifications.show({
      title: messages.messagesPage.welcomeBackTitle,
      message: messages.messagesPage.welcomeBackMessage,
      color: "green",
    });
    sessionStorage.removeItem("newLogin");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Brings a newly arrived question into view, but only if it landed off screen. */
function useScrollToNewMessages(messages: Message[] | undefined, enabled: boolean) {
  const previousCount = useRef(0);

  useEffect(() => {
    const count = messages?.length ?? 0;
    const grew = count > previousCount.current;
    previousCount.current = count;
    if (!enabled || !grew || !messages?.[0]) return;

    const newest = document.getElementById(`message-card-${messages[0].tid}`);
    /* istanbul ignore next */
    if (!newest) return;
    const { top, bottom } = newest.getBoundingClientRect();
    if (top >= window.innerHeight || bottom <= 0) {
      newest.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, enabled]);
}
