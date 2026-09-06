import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import {
  useRespondToMessage,
  type Message,
  type ResponseMessageResponse,
} from "../api/messageService";
import { resolveApiErrorMessage } from "./i18n/apiErrors";
import { useTranslations } from "./i18n";
import { useQuestionRender } from "./useQuestionRender";

import type { ThreadRoot } from "./useThreadRoot";
import type { ReactNode } from "react";

/** /messages/respond's answer when the render it was handed is not ready yet. */
const RENDER_NOT_READY = 409;

const POSTED_NOTICE_AUTOCLOSE_MS = 8000;

/** A reply the user has committed to, waiting on its question image. */
interface QueuedSend {
  message: Message;
  response: string;
}

export interface ReplyComposerArgs {
  messages: Message[] | undefined;
  thread: ThreadRoot;
  /** The owner's stored image theme — a different theme is a different render. */
  imageTheme?: string;
  includeQuestionAsImage: boolean;
  appendProfileLink: boolean;
  /** The owner's inbox link, appended to the post when they've asked for it. */
  shortUrl: string;
  handle: string;
  /**
   * Renders the "posted" toast body. Takes the whole response rather than just
   * its link: which Atmosphere client the link should open in is the page's
   * business, not the composer's, and that choice reads the posted AT URI.
   */
  renderPostedNotice: (posted: ResponseMessageResponse, inThread: boolean) => ReactNode;
  onPosted: () => void;
}

export interface ReplyComposer {
  /** The question whose composer is open, or null when none is. */
  respondingTid: string | null;
  responseText: string;
  setResponseText: (text: string) => void;
  open: (tid: string) => void;
  close: () => void;
  send: (message: Message, response: string) => void;
  /** A reply is in flight, or waiting on the image it will carry. */
  sending: boolean;
  /** Specifically waiting on a render, which the composer says out loud. */
  awaitingRender: boolean;
}

/**
 * Owns one open reply composer and the question-image render it is waiting on.
 *
 * The render is kept in flight for whichever composer is open so the image
 * service's cold start overlaps with the user typing, and the send is queued
 * behind it rather than blocking on it.
 *
 * @see [Messages.test.tsx](../tests/pages/Messages.test.tsx) — pins the
 * double-submit guard, the queued send, and the composer/render pairing.
 */
export function useReplyComposer({
  messages,
  thread,
  imageTheme,
  includeQuestionAsImage,
  appendProfileLink,
  shortUrl,
  handle,
  renderPostedNotice,
  onPosted,
}: ReplyComposerArgs): ReplyComposer {
  const translations = useTranslations();
  const { mutate: respondToMessage, isPending: respondLoading } = useRespondToMessage();

  const [respondingTid, setRespondingTid] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [queuedSend, setQueuedSend] = useState<QueuedSend | null>(null);

  const respondingMessage = messages?.find((m) => m.tid === respondingTid) ?? null;
  const render = useQuestionRender({
    target: respondingMessage
      ? { tid: respondingMessage.tid, original: respondingMessage.message }
      : null,
    theme: imageTheme,
    enabled: includeQuestionAsImage,
  });

  /**
   * The open composer is what the render follows, so moving it while a send is
   * waiting would hand that send the *new* question's image. `claimReady` only
   * checks the DID, so the wrong image would post to Bluesky rather than be
   * rejected.
   *
   * @see [Messages.test.tsx](../tests/pages/Messages.test.tsx) — "opening
   * another question while a send waits on its render does not move the
   * composer" and "posts the queued reply with its own question's render".
   */
  const open = (tid: string) => {
    if (queuedSend) return;
    setRespondingTid(tid);
    setResponseText("");
  };

  /** Abandons the queued send too: a reply nobody is waiting for must not post. */
  const close = () => {
    setRespondingTid(null);
    setQueuedSend(null);
  };

  const postResponse = (message: Message, response: string, renderId?: string) => {
    const text = appendProfileLink && handle ? `${response} ${shortUrl}` : response;
    const replyTo = thread.replyTarget(message.tid);

    respondToMessage(
      {
        tid: message.tid,
        recipient: message.recipient,
        original: message.message,
        response: text,
        includeQuestionAsImage,
        replyTo,
        renderId,
      },
      {
        onSuccess: (data) => {
          if (thread.isRoot(message.tid) && data.uri && data.cid) {
            thread.recordReply(message.tid, { uri: data.uri, cid: data.cid, link: data.link });
          }
          close();
          setResponseText("");
          notifications.show({
            title: replyTo
              ? translations.messagesPage.threadReplyTitle
              : translations.messagesPage.responseSentTitle,
            message: renderPostedNotice(data, !!replyTo),
            color: "green",
            autoClose: POSTED_NOTICE_AUTOCLOSE_MS,
          });
          onPosted();
        },
        onError: (err) => {
          // The render was consumed, expired, or never finished. The server told
          // us which, so go back to waiting on it rather than blaming the user.
          if (err.status === RENDER_NOT_READY) {
            render.recover();
            setQueuedSend({ message, response });
            return;
          }
          notifications.show({
            title: translations.messagesPage.responseErrorTitle,
            message: resolveApiErrorMessage(err, translations),
            color: "red",
          });
        },
      }
    );
  };

  /**
   * @see [Messages.test.tsx](../tests/pages/Messages.test.tsx) — "pressing Enter
   * while a response is already in flight does not submit again" and "a second
   * Enter while the question image is still rendering posts once" pin the guard
   * below. Nothing downstream of it is idempotent: /messages/respond creates a
   * fresh Bluesky post per call, and the wait is now long enough to invite a
   * second press.
   */
  const send = (message: Message, response: string) => {
    if (respondLoading || queuedSend) return;

    if (!response.trim()) {
      notifications.show({
        title: translations.messagesPage.emptyResponseTitle,
        message: translations.messagesPage.emptyResponseMessage,
        color: "yellow",
      });
      return;
    }

    if (!includeQuestionAsImage) {
      postResponse(message, response);
      return;
    }

    // Reading a failed render clears it server-side, so a send after one has to
    // ask for a fresh render rather than wait on the key it already reported.
    if (render.status === "failed") render.retry();
    setQueuedSend({ message, response });
  };

  useEffect(() => {
    if (!queuedSend) return;
    // No render to wait for: send it the old way and let the server render it.
    // `idle` belongs here too — the image toggle going off mid-wait, or the open
    // message leaving the list, ends the render without ever settling it, and a
    // status this effect does not release strands the send with no way back.
    if (render.status === "unavailable" || render.status === "idle") {
      setQueuedSend(null);
      postResponse(queuedSend.message, queuedSend.response);
      return;
    }
    if (render.status === "failed") {
      setQueuedSend(null);
      notifications.show({
        title: translations.messagesPage.imageRenderFailedTitle,
        message: render.error || translations.messagesPage.imageRenderFailedMessage,
        color: "red",
      });
      return;
    }
    if (!render.readyRenderId) return;
    setQueuedSend(null);
    postResponse(queuedSend.message, queuedSend.response, render.readyRenderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedSend, render.status, render.readyRenderId]);

  return {
    respondingTid,
    responseText,
    setResponseText,
    open,
    close,
    send,
    sending: respondLoading || queuedSend !== null,
    awaitingRender: queuedSend !== null,
  };
}
