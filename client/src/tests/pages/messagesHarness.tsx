/**
 * Shared setup for the Messages page suites, which are split by feature —
 * `Messages.test.tsx` (page shell), `.reply`, `.delete`, `.thread`, and
 * `.questionImage`. The module mocks live here because a `vi.mock` call in an
 * imported module still registers for the test file that imported it, so each
 * suite gets the same fakes without restating them.
 */
import { notifications } from "@mantine/notifications";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";

import * as authService from "../../api/authService";
import * as messageService from "../../api/messageService";
import * as settingsService from "../../api/settingsService";
import { en } from "../../lib/i18n/en";
import Messages from "../../pages/Messages";
import { renderWithProviders } from "../testUtils";

vi.mock("../../api/authService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/authService")>();
  return { ...actual, useSession: vi.fn() };
});

vi.mock("../../api/messageService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/messageService")>();
  return {
    ...actual,
    messageService: { ...actual.messageService, warmImageService: vi.fn() },
    useMessages: vi.fn(),
    useDeleteMessage: vi.fn(),
    useRespondToMessage: vi.fn(),
    useAddExampleMessages: vi.fn(),
    useStartRender: vi.fn(),
    useRenderStatus: vi.fn(),
  };
});

vi.mock("../../api/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/settingsService")>();
  return {
    ...actual,
    useUserSettings: vi.fn(),
    useUpdateUserSettings: vi.fn(),
  };
});

export const mockUseSession = vi.mocked(authService.useSession);
export const mockUseMessages = vi.mocked(messageService.useMessages);
export const mockUseDeleteMessage = vi.mocked(messageService.useDeleteMessage);
export const mockUseRespondToMessage = vi.mocked(messageService.useRespondToMessage);
export const mockUseAddExampleMessages = vi.mocked(messageService.useAddExampleMessages);
export const mockUseUserSettings = vi.mocked(settingsService.useUserSettings);
export const mockUseUpdateUserSettings = vi.mocked(settingsService.useUpdateUserSettings);
export const mockUseStartRender = vi.mocked(messageService.useStartRender);
export const mockUseRenderStatus = vi.mocked(messageService.useRenderStatus);

export const RENDER_ID = "render-abc";

/**
 * getAllByRole name matcher for a QuestionCard's own reply-trigger button --
 * matches both catalog labels ("reply" vs "reply to thread", pinned vs not)
 * rather than English text, so it survives a locale switch.
 */
export const isReplyTriggerName = (name: string) =>
  name === en.questionCard.reply || name === en.questionCard.replyToThread;

/**
 * The render pipeline stands in for a server that answers instantly: the start
 * mutation hands back a key synchronously and the poll reports it ready, so a
 * send that queues on the render still lands in the same act() flush. Tests that
 * care about the wait drive `render.poll` themselves, keyed by attempt the way
 * the real poll is.
 *
 * Held on one object rather than as loose `let`s so a suite can reassign them
 * across the module boundary.
 */
export const render: {
  poll: (attempt: number) => { status: string; error?: string } | undefined;
  /** Set when the render endpoint itself is the thing that is broken. */
  startFails: boolean;
} = {
  poll: () => ({ status: "ready" }),
  startFails: false,
};

export const startRenderMutate = vi.fn(
  (
    _data: unknown,
    callbacks?: { onSuccess?: (data: unknown) => void; onError?: (error: unknown) => void }
  ) => {
    if (render.startFails) {
      callbacks?.onError?.({ error: "not found", status: 404 });
      return;
    }
    callbacks?.onSuccess?.({ renderId: RENDER_ID, status: "pending" });
  }
);
const startRenderResult = { mutate: startRenderMutate };

export const SESSION = {
  isLoggedIn: true,
  did: "did:example:1",
  profile: { displayName: "Karan", handle: "karan.bsky.social" },
};

export const MESSAGES: messageService.Message[] = [
  {
    tid: "msg-1",
    message: "Hello?",
    createdAt: "2024-03-15T14:30:00.000Z",
    recipient: "did:example:1",
  },
  {
    tid: "msg-2",
    message: "What is your favorite color?",
    createdAt: "2024-03-14T10:00:00.000Z",
    recipient: "did:example:1",
  },
];

export const noopMutation = { mutate: vi.fn(), isPending: false } as any;

export function setupMocks(messages = MESSAGES) {
  mockUseSession.mockReturnValue({ data: SESSION, isLoading: false } as any);
  mockUseMessages.mockReturnValue({
    data: { messages },
    isLoading: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  } as any);
  mockUseDeleteMessage.mockReturnValue(noopMutation);
  mockUseRespondToMessage.mockReturnValue(noopMutation);
  mockUseAddExampleMessages.mockReturnValue(noopMutation);
  mockUseUserSettings.mockReturnValue({
    data: { pdsSyncEnabled: false, imageTheme: "default" },
    isLoading: false,
  } as any);
  mockUseUpdateUserSettings.mockReturnValue(noopMutation);
}

/** The per-test reset every Messages suite runs, as its own `beforeEach` body. */
export function resetMessagesPage() {
  vi.clearAllMocks();
  localStorage.clear();
  notifications.clean();
  // The inbox card's OG warm is the page's only same-origin fetch; left real
  // it dials localhost from every test that copies or shares the link.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  render.poll = () => ({ status: "ready" });
  render.startFails = false;
  mockUseStartRender.mockReturnValue(startRenderResult as any);
  mockUseRenderStatus.mockImplementation(
    (renderId, attempt) => ({ data: renderId ? render.poll(attempt) : undefined }) as any
  );
}

/** Opens the reply composer on the message at `index` in the rendered list. */
export function openComposerFor(index = 0) {
  const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
  fireEvent.click(replyButtons.filter((b) => b.textContent?.includes("↩"))[index]);
  return screen.findByRole("textbox", { name: en.replyComposer.responseAriaLabel });
}

/** Types `text` into the open composer and clicks its send button. */
export async function typeAndSend(text = "My answer!") {
  fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: en.replyComposer.reply }));
}

/**
 * Opens msg-1's composer, types a reply and sends it, leaving the send queued
 * on a render that never settles. Returns the textarea so a test can force the
 * re-render that a settled poll would otherwise arrive on.
 */
export async function queueSendOnAStuckRender(
  respondMutate: ReturnType<typeof vi.fn>,
  deleteMutate?: ReturnType<typeof vi.fn>
) {
  setupMocks();
  mockUseRespondToMessage.mockReturnValue({ mutate: respondMutate, isPending: false } as any);
  if (deleteMutate) {
    mockUseDeleteMessage.mockReturnValue({ mutate: deleteMutate, isPending: false } as any);
  }
  render.poll = () => ({ status: "rendering" });
  renderWithProviders(<Messages />);

  const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
  fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
  await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));

  const textarea = screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel });
  fireEvent.change(textarea, { target: { value: "My answer!" } });
  fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

  await screen.findByText(en.replyComposer.renderingImage);
  expect(respondMutate).not.toHaveBeenCalled();
  return textarea;
}
