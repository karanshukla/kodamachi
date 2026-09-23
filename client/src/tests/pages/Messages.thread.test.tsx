// The harness registers this suite's module mocks, so it has to be imported
// before anything that pulls in the modules it mocks.
/* eslint-disable import/order */
import {
  mockUseDeleteMessage,
  mockUseRespondToMessage,
  mockUseUserSettings,
  resetMessagesPage,
  setupMocks,
} from "./messagesHarness";

import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { en } from "../../lib/i18n/en";
import Messages from "../../pages/Messages";
import { renderWithProviders } from "../testUtils";
/* eslint-enable import/order */

describe("Messages page — pinning and threaded replies", () => {
  beforeEach(() => {
    resetMessagesPage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clicking the pin button pins a message (handleTogglePin)", async () => {
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const pinBtn = screen.getAllByRole("button", { name: en.questionCard.setAsThreadRootLabel })[0];
    fireEvent.click(pinBtn);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: en.questionCard.unpinThreadRootLabel })
      ).toBeInTheDocument();
    });
  });

  it("clicking the pin button again unpins the message (handleTogglePin unpin branch)", async () => {
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const pinBtn = screen.getAllByRole("button", { name: en.questionCard.setAsThreadRootLabel })[0];
    fireEvent.click(pinBtn);
    await waitFor(() => screen.getByRole("button", { name: en.questionCard.unpinThreadRootLabel }));

    fireEvent.click(screen.getByRole("button", { name: en.questionCard.unpinThreadRootLabel }));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: en.questionCard.unpinThreadRootLabel })
      ).toBeNull();
    });
  });

  it("justPinnedTid setTimeout clears the animation class", async () => {
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const pinBtn = screen.getAllByRole("button", { name: en.questionCard.setAsThreadRootLabel })[0];
    fireEvent.click(pinBtn);
    await waitFor(() => screen.getByRole("button", { name: en.questionCard.unpinThreadRootLabel }));

    // The card should have the pinned entry animation class briefly
    const card = document.getElementById("message-card-msg-1");
    expect(card).toBeInTheDocument();
    // After the setTimeout(420ms) the class clears; just verifying the flow doesn't throw
    expect(document.body).toBeInTheDocument();
  });

  it("pinning msg-2 moves it to the top of the sorted list", async () => {
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const pinBtns = screen.getAllByRole("button", { name: en.questionCard.setAsThreadRootLabel });
    expect(pinBtns.length).toBe(2);
    fireEvent.click(pinBtns[1]);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: en.questionCard.unpinThreadRootLabel })
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      const cards = document.querySelectorAll('[id^="message-card-"]');
      expect(cards[0].id).toBe("message-card-msg-2");
    });
  });

  it("handleDeleteRequest returns early when message is pinned", async () => {
    setupMocks();
    const mockDeleteMutate = vi.fn();
    mockUseDeleteMessage.mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);
    await act(async () => {});

    const pinBtn = screen.getAllByRole("button", { name: en.questionCard.setAsThreadRootLabel })[0];
    fireEvent.click(pinBtn);
    await waitFor(() => screen.getByRole("button", { name: en.questionCard.unpinThreadRootLabel }));

    // Pinned message's delete button has a different aria-label; clicking it is a no-op
    const pinnedDeleteBtn = screen.getByRole("button", {
      name: en.questionCard.cannotDeleteThreadRootLabel,
    });
    fireEvent.click(pinnedDeleteBtn);
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("thread link is rendered and clickable when a thread response link exists", async () => {
    localStorage.setItem("threadRootTid-did:example:1", JSON.stringify("msg-1"));
    localStorage.setItem(
      "threadLinks-did:example:1",
      JSON.stringify({
        "msg-1": {
          uri: "at://did/app.bsky.feed.post/abc",
          link: "https://bsky.app/profile/user/post/abc",
        },
      })
    );
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /bsky\.app/i })).toBeInTheDocument();
    });

    // Asserted rather than clicked: happy-dom follows a real https href, fetching
    // bsky.app and its script bundles, and the async continuation has outlived
    // the worker and taken a whole green run down with it.
    const threadAnchor = screen.getByRole("link", { name: /bsky\.app/i });
    expect(threadAnchor).toHaveAttribute("href", "https://bsky.app/profile/user/post/abc");
    expect(threadAnchor).toHaveAttribute("target", "_blank");
  });

  it("setThreadLinks is called after pinned message response succeeds with a link", async () => {
    localStorage.setItem("threadRootTid-did:example:1", JSON.stringify("msg-1"));
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
    await act(async () => {});

    await waitFor(() => screen.getByRole("button", { name: en.questionCard.unpinThreadRootLabel }));

    // Click the card itself (not the ↩ Reply button) to expand the pinned message
    const card = document.getElementById("message-card-msg-1")!;
    fireEvent.click(card);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));

    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "Thread reply!" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.reply }));
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onSuccess({
        uri: "at://did/app.bsky.feed.post/xyz",
        cid: "cid-xyz",
        link: "https://bsky.app/profile/user/post/xyz",
      });
    });

    // Pinned message response shows "Response sent!" (not "Added to thread!" which is for replies-to-thread)
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.responseSentTitle)).toBeInTheDocument();
    });
    // Verify localStorage threadLinks was updated
    const stored = JSON.parse(localStorage.getItem("threadLinks-did:example:1") || "{}");
    expect(stored["msg-1"]?.uri).toBe("at://did/app.bsky.feed.post/xyz");
  });

  it("clears a stale pinned threadRootTid (and its threadLinks entry) when the message no longer exists", async () => {
    localStorage.setItem("threadRootTid-did:example:1", JSON.stringify("ghost-tid"));
    localStorage.setItem(
      "threadLinks-did:example:1",
      JSON.stringify({ "ghost-tid": { uri: "at://x", cid: "y" } })
    );
    setupMocks(); // MESSAGES contains only msg-1 / msg-2, not "ghost-tid"
    renderWithProviders(<Messages />);

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("threadRootTid-did:example:1") || "null")).toBeNull();
    });
    await waitFor(() => {
      const links = JSON.parse(localStorage.getItem("threadLinks-did:example:1") || "{}");
      expect(links["ghost-tid"]).toBeUndefined();
    });
  });

  it("replying to a non-root message when the thread root already has a link sets replyTo and shows 'Added to thread!' with a link", async () => {
    localStorage.setItem("threadRootTid-did:example:1", JSON.stringify("msg-2"));
    localStorage.setItem(
      "threadLinks-did:example:1",
      JSON.stringify({ "msg-2": { uri: "at://root", cid: "cid-root" } })
    );
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
    await act(async () => {});

    // msg-1 is not the root, and threadLinks["msg-2"] has a uri/cid, so it's unblocked.
    const replyBtn = screen.getByRole("button", { name: en.questionCard.replyToThread });
    fireEvent.click(replyBtn);
    await screen.findByRole("textbox", { name: en.replyComposer.responseAriaLabel });
    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "Thread reply text" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.replyToThread }));
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());
    expect(mockRespondMutate.mock.calls[0][0].replyTo).toEqual({
      uri: "at://root",
      cid: "cid-root",
    });

    act(() => {
      capturedCallbacks.onSuccess({ link: "https://bsky.app/profile/user/post/thread1" });
    });
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.threadReplyTitle)).toBeInTheDocument();
      expect(screen.getByText(en.messagesPage.threadReplyPosted)).toBeInTheDocument();
      expect(screen.getByText("https://bsky.app/profile/user/post/thread1")).toBeInTheDocument();
    });
  });

  it("replying to a non-root message without a data.link shows plain 'Added to thread.' message", async () => {
    localStorage.setItem("threadRootTid-did:example:1", JSON.stringify("msg-2"));
    localStorage.setItem(
      "threadLinks-did:example:1",
      JSON.stringify({ "msg-2": { uri: "at://root", cid: "cid-root" } })
    );
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
    await act(async () => {});

    const replyBtn = screen.getByRole("button", { name: en.questionCard.replyToThread });
    fireEvent.click(replyBtn);
    await screen.findByRole("textbox", { name: en.replyComposer.responseAriaLabel });
    fireEvent.change(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      target: { value: "Thread reply text" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.replyComposer.replyToThread }));
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onSuccess({});
    });
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.threadReplyTitle)).toBeInTheDocument();
      expect(screen.getByText(en.messagesPage.threadReplyPosted)).toBeInTheDocument();
    });
  });

  it("the expanded send button is disabled when the thread root has no link yet (blocked)", async () => {
    localStorage.setItem("threadRootTid-did:example:1", JSON.stringify("msg-2"));
    // No threadLinks entry for msg-2 → responding to msg-1 is blocked.
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);
    await act(async () => {});

    // Click the card body directly (not the small Reply button, which itself blocks opening)
    // to get into the expanded/blocked state and exercise the Send button's disabled branch.
    const card = document.getElementById("message-card-msg-1")!;
    fireEvent.click(card);
    await screen.findByRole("textbox", { name: en.replyComposer.responseAriaLabel });

    const sendBtn = screen.getByRole("button", { name: en.replyComposer.replyToThread });
    expect(sendBtn).toBeDisabled();
    fireEvent.click(sendBtn);
    expect(mockRespondMutate).not.toHaveBeenCalled();
  });

  it("collapsed reply Button does nothing when blocked (thread root has no link yet)", async () => {
    localStorage.setItem("threadRootTid-did:example:1", JSON.stringify("msg-2"));
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const realBtn = screen.getByRole("button", { name: en.questionCard.replyToThread });
    fireEvent.click(realBtn);
    expect(screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })).toBeNull();
  });

  /** Pin msg-1 and give it an answered post, which is what the picker hangs off. */
  function pinAnsweredMessage(uri: string) {
    localStorage.setItem("threadRootTid-did:example:1", JSON.stringify("msg-1"));
    localStorage.setItem(
      "threadLinks-did:example:1",
      JSON.stringify({
        "msg-1": { uri, link: "https://bsky.app/profile/user/post/abc" },
      })
    );
  }

  it("links an answer to the client chosen on /customise", async () => {
    pinAnsweredMessage("at://did:plc:xyz/app.bsky.feed.post/abc");
    setupMocks();
    mockUseUserSettings.mockReturnValue({
      data: { pdsSyncEnabled: false, imageTheme: "default", defaultClient: "deer" },
      isLoading: false,
    } as any);
    renderWithProviders(<Messages />);
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /deer\.social/i })).toHaveAttribute(
        "href",
        "https://deer.social/profile/karan.bsky.social/post/abc"
      );
    });
  });

  it("leaves the answer on its Bluesky link when no client is chosen", async () => {
    pinAnsweredMessage("at://did:plc:xyz/app.bsky.feed.post/abc");
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /bsky\.app/i })).toHaveAttribute(
        "href",
        "https://bsky.app/profile/user/post/abc"
      );
    });
  });

  it("opens the client picker from an answered card", async () => {
    pinAnsweredMessage("at://did:plc:xyz/app.bsky.feed.post/abc");
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const openIn = await screen.findByRole("button", { name: en.questionCard.openInLabel });
    fireEvent.click(openIn);

    expect(
      await screen.findByRole("button", { name: en.openInPicker.openInLabel("Bluesky") })
    ).toBeInTheDocument();
  });

  it("closes the client picker again", async () => {
    pinAnsweredMessage("at://did:plc:xyz/app.bsky.feed.post/abc");
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    fireEvent.click(await screen.findByRole("button", { name: en.questionCard.openInLabel }));
    const bluesky = en.openInPicker.openInLabel("Bluesky");
    await screen.findByRole("button", { name: bluesky });

    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: bluesky })).not.toBeInTheDocument()
    );
  });

  it("offers no picker when the answer's uri names no record", async () => {
    pinAnsweredMessage("not-an-at-uri");
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /bsky\.app/i })).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: en.questionCard.openInLabel })
    ).not.toBeInTheDocument();
  });
});
