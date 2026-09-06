// The harness registers this suite's module mocks, so it has to be imported
// before anything that pulls in the modules it mocks.
/* eslint-disable import/order */
import {
  MESSAGES,
  SESSION,
  isReplyTriggerName,
  mockUseMessages,
  mockUseRespondToMessage,
  mockUseUserSettings,
  resetMessagesPage,
  setupMocks,
} from "./messagesHarness";

import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { en } from "../../lib/i18n/en";
import Messages from "../../pages/Messages";
import { renderWithProviders } from "../testUtils";
/* eslint-enable import/order */

describe("Messages page — composing and posting a reply", () => {
  beforeEach(() => {
    resetMessagesPage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pressing Escape in the response textarea closes the response area", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    const openReplyBtn = replyButtons.find((b) => b.textContent?.includes("↩"));
    fireEvent.click(openReplyBtn!);

    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      key: "Escape",
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      ).toBeNull();
    });
  });

  it("pressing Enter (without Shift) in response textarea submits the response", async () => {
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    const openReplyBtn = replyButtons.find((b) => b.textContent?.includes("↩"));
    fireEvent.click(openReplyBtn!);

    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    const textarea = screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel });
    fireEvent.change(textarea, { target: { value: "My answer!" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());
  });

  it("pressing Enter while a response is already in flight does not submit again", async () => {
    // The other side of the test above. A cold image render leaves the composer
    // silent for seconds, and an unguarded Enter is how one reply became four.
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: true,
    } as any);
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);

    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    const textarea = screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel });
    fireEvent.change(textarea, { target: { value: "My answer!" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(mockRespondMutate).not.toHaveBeenCalled();
  });

  it("sending an empty response shows 'Empty Response' notification", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));

    // Click Reply without typing anything
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.reply }));
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.emptyResponseTitle)).toBeInTheDocument();
    });
  });

  it("handleSendResponse with appendProfileLink=true appends the profile link", async () => {
    localStorage.setItem("appendProfileLink", JSON.stringify(true));
    let capturedData: any;
    const mockRespondMutate = vi.fn((data: any, _callbacks: any) => {
      capturedData = data;
    });
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "Great answer!" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.reply }));

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());
    expect(capturedData.response).toContain("Great answer!");
    expect(capturedData.response).toContain(SESSION.profile.handle);
  });

  it("handleSendResponse onSuccess with data.link shows link in notification", async () => {
    let capturedCallbacks: any;
    const mockRespondMutate = vi.fn((_data: any, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "My answer!" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.reply }));
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onSuccess({
        link: "https://bsky.app/profile/user/post/123",
      });
    });
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.responseSentTitle)).toBeInTheDocument();
      expect(screen.getByText("https://bsky.app/profile/user/post/123")).toBeInTheDocument();
    });
  });

  it("handleSendResponse onSuccess without data.link shows plain success message", async () => {
    let capturedCallbacks: any;
    const mockRespondMutate = vi.fn((_data: any, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "My answer!" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.reply }));
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onSuccess({});
    });
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.responseSentTitle)).toBeInTheDocument();
      expect(screen.getByText(en.messagesPage.responsePosted)).toBeInTheDocument();
    });
  });

  it("character limit decreases when appendProfileLink switch is toggled on", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));

    expect(screen.getByText("0/277")).toBeInTheDocument();

    const appendSwitch = screen.getByLabelText(/auto-append inbox link/i);
    fireEvent.click(appendSwitch);

    await waitFor(() => {
      expect(screen.queryByText("0/277")).toBeNull();
    });
  });

  it("global Escape key collapses the expanded card when fired from document", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));

    // Fire Escape on the document (not the textarea) to hit the global keydown handler
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      ).toBeNull();
    });
  });

  it("pressing Enter on a card expands it; pressing Enter again collapses it", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const card = document.getElementById("message-card-msg-1");
    if (card) {
      fireEvent.focus(card);
      // Enter when not expanded → expand
      fireEvent.keyDown(card, { key: "Enter" });
      await waitFor(() =>
        screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      );

      // Enter when expanded → collapse
      fireEvent.keyDown(card, { key: "Enter" });
      await waitFor(() => {
        expect(
          screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })
        ).toBeNull();
      });
    }
  });

  it("clicking the card while it is expanded collapses it", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    // Open reply via the "↩ Reply" button
    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));

    // Click the message text to hit the card's onClick with isExpanded=true
    const msgText = screen.getByText("Hello?");
    fireEvent.click(msgText);
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      ).toBeNull();
    });
  });

  it("shows an error toast notification when responding fails", async () => {
    let capturedRespondCallbacks: any;
    setupMocks();
    const mockRespondMutate = vi.fn((_data: any, callbacks: any) => {
      capturedRespondCallbacks = callbacks;
    });
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    // Click the "↩ Reply" button (text button to open the response area)
    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    const openReplyBtn = replyButtons.find((b) => b.textContent?.includes("↩"));
    fireEvent.click(openReplyBtn!);

    // Wait for the response textarea to appear
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "Great question!" },
    });

    // Click the "Reply" send button (the gradient button inside the response box)
    const sendReplyBtn = screen.getByRole("button", { name: en.replyComposer.reply });
    fireEvent.click(sendReplyBtn);
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());

    act(() => {
      capturedRespondCallbacks.onError({ error: "Post failed" });
    });

    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.responseErrorTitle)).toBeInTheDocument();
    });
  });

  it("collapsed reply Box onClick stops propagation (card doesn't expand)", async () => {
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const replyBtns = screen.getAllByRole("button", { name: isReplyTriggerName });
    const collapsedBtn = replyBtns.find((b) => b.textContent?.includes("↩"))!;
    const boxDiv = collapsedBtn.parentElement!;

    // Click the Box div directly — fires stopPropagation, Paper's onClick is NOT called
    fireEvent.click(boxDiv);

    // Card should NOT expand (no textarea) since the click was stopped before Paper onClick
    expect(screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })).toBeNull();
  });

  it("collapsed reply Button onClick expands card (userEvent)", async () => {
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const replyBtns = screen.getAllByRole("button", { name: isReplyTriggerName });
    const collapsedBtn = replyBtns.find((b) => b.textContent?.includes("↩"))!;

    const user = userEvent.setup();
    await user.click(collapsedBtn);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      ).toBeInTheDocument();
    });
  });

  it("CharRing shows the danger color once the response exceeds 90% of the character limit", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const realReplyBtn = screen.getAllByRole("button", { name: "↩ Reply" })[0];
    fireEvent.click(realReplyBtn);
    const textarea = await screen.findByRole("textbox", {
      name: en.replyComposer.responseAriaLabel,
    });

    const longText = "a".repeat(260); // > 90% of the default 277 char limit
    fireEvent.change(textarea, { target: { value: longText } });

    await waitFor(() => {
      expect(screen.getByText(`${longText.length}/277`)).toBeInTheDocument();
    });

    const dangerCircle = Array.from(document.querySelectorAll("svg circle")).find(
      (c) => c.getAttribute("stroke") === "var(--ds-compose-warn)"
    );
    expect(dangerCircle).toBeTruthy();
  });

  it("characterLimit skips the question-length subtraction once the responding message disappears from the list", async () => {
    localStorage.setItem("includeQuestionAsImage", JSON.stringify(false));
    setupMocks();
    const { rerender } = renderWithProviders(<Messages />);

    const realReplyBtn = screen.getAllByRole("button", { name: "↩ Reply" })[0];
    fireEvent.click(realReplyBtn);
    await screen.findByRole("textbox", { name: en.replyComposer.responseAriaLabel });
    // With includeQuestionAsImage off, the question text is subtracted from the base 277 limit.
    expect(screen.queryByText(/^0\/277$/)).toBeNull();

    // Simulate the message list refreshing without msg-1 while still "responding" to it
    // (e.g. it was deleted from another tab, or a refetch raced the in-progress reply).
    mockUseMessages.mockReturnValue({
      data: { messages: [MESSAGES[1]] },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    expect(() => rerender(<Messages />)).not.toThrow();

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      ).toBeNull();
    });
    expect(screen.getByText("What is your favorite color?")).toBeInTheDocument();
  });

  it("collapsed reply Box wrapper stops click propagation without itself opening the response box", () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const realBtn = screen.getAllByRole("button", { name: "↩ Reply" })[0];
    const boxDiv = realBtn.parentElement!;
    fireEvent.click(boxDiv);

    expect(screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })).toBeNull();
  });

  it("collapsed reply Button (exact match) opens the response box when not blocked", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const realBtn = screen.getAllByRole("button", { name: "↩ Reply" })[0];
    fireEvent.click(realBtn);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      ).toBeInTheDocument();
    });
  });

  it("pressing a non-Enter/Space key on a message card does nothing", () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const card = document.getElementById("message-card-msg-1")!;
    fireEvent.focus(card);
    fireEvent.keyDown(card, { key: "Tab" });

    expect(screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })).toBeNull();
  });

  it("pressing Shift+Enter in the response textarea does not submit the response", async () => {
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const realReplyBtn = screen.getAllByRole("button", { name: "↩ Reply" })[0];
    fireEvent.click(realReplyBtn);
    const textarea = await screen.findByRole("textbox", {
      name: en.replyComposer.responseAriaLabel,
    });
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(mockRespondMutate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel })
    ).toBeInTheDocument();
  });

  it("handleSendResponse onError falls back to a default message when err.error is missing", async () => {
    let capturedRespondCallbacks: any;
    setupMocks();
    const mockRespondMutate = vi.fn((_data: any, callbacks: any) => {
      capturedRespondCallbacks = callbacks;
    });
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const realReplyBtn = screen.getAllByRole("button", { name: "↩ Reply" })[0];
    fireEvent.click(realReplyBtn);
    await screen.findByRole("textbox", { name: en.replyComposer.responseAriaLabel });
    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "Great question!" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.reply }));
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());

    act(() => {
      capturedRespondCallbacks.onError({});
    });
    await waitFor(() => {
      expect(screen.getByText(en.errors.generic)).toBeInTheDocument();
    });
  });

  it("points the posted-answer toast at the client the user picked", async () => {
    let capturedCallbacks: any;
    const mockRespondMutate = vi.fn((_data: any, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    setupMocks();
    mockUseUserSettings.mockReturnValue({
      data: { pdsSyncEnabled: false, imageTheme: "default", defaultClient: "deer" },
      isLoading: false,
    } as any);
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "My answer!" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.reply }));
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onSuccess({
        uri: "at://did:plc:abc123/app.bsky.feed.post/3k7qw",
        link: "https://bsky.app/profile/user/post/123",
      });
    });
    await waitFor(() => {
      expect(
        screen.getByText("https://deer.social/profile/karan.bsky.social/post/3k7qw")
      ).toBeInTheDocument();
    });
  });
});
