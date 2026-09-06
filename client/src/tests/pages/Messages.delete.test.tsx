// The harness registers this suite's module mocks, so it has to be imported
// before anything that pulls in the modules it mocks.
/* eslint-disable import/order */
import {
  isReplyTriggerName,
  mockUseDeleteMessage,
  queueSendOnAStuckRender,
  resetMessagesPage,
  setupMocks,
} from "./messagesHarness";

import { screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { en } from "../../lib/i18n/en";
import Messages from "../../pages/Messages";
import { renderWithProviders } from "../testUtils";
/* eslint-enable import/order */

describe("Messages page — deleting a question", () => {
  beforeEach(() => {
    resetMessagesPage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an error toast notification when delete fails", async () => {
    let capturedCallbacks: any;
    setupMocks();
    const mockDeleteMutate = vi.fn((_tid: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    mockUseDeleteMessage.mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const deleteButtons = screen.getAllByRole("button", {
      name: en.questionCard.deleteMessageLabel,
    });
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onError({ error: "MESSAGE_TID_REQUIRED", message: "Message TID required" });
    });

    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.deleteErrorTitle)).toBeInTheDocument();
      expect(screen.getByText(en.errors.codes.MESSAGE_TID_REQUIRED)).toBeInTheDocument();
    });
  });

  it("falls back to the server's message when the delete error isn't a known code", async () => {
    let capturedCallbacks: any;
    setupMocks();
    const mockDeleteMutate = vi.fn((_tid: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    mockUseDeleteMessage.mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    const deleteButtons = screen.getAllByRole("button", {
      name: en.questionCard.deleteMessageLabel,
    });
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalled());

    act(() => {
      // The delete route still passes an internal thrown message through the
      // bare `error` field rather than a code. An unrecognized `error` value
      // must never render verbatim, and there's no `message` field either, so
      // this exercises the generic fallback.
      capturedCallbacks.onError({ error: "Network error" });
    });

    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.deleteErrorTitle)).toBeInTheDocument();
      expect(screen.getByText(en.errors.generic)).toBeInTheDocument();
    });
  });

  it("refuses to delete the question whose reply is in flight", async () => {
    const mockDeleteMutate = vi.fn();
    await queueSendOnAStuckRender(vi.fn(), mockDeleteMutate);

    const card = document.getElementById("message-card-msg-1")!;
    fireEvent.click(
      within(card).getByRole("button", { name: en.questionCard.cannotDeleteWhilePostingLabel })
    );

    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("still allows deleting a question whose reply is not in flight", async () => {
    const mockDeleteMutate = vi.fn();
    await queueSendOnAStuckRender(vi.fn(), mockDeleteMutate);

    const other = document.getElementById("message-card-msg-2")!;
    fireEvent.click(
      within(other).getByRole("button", { name: en.questionCard.deleteMessageLabel })
    );

    expect(mockDeleteMutate).toHaveBeenCalledWith("msg-2", expect.any(Object));
  });

  it("delete button with confirmBeforeDelete=true opens confirmation modal", async () => {
    localStorage.setItem("confirmBeforeDelete", JSON.stringify(true));
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    const deleteButtons = screen.getAllByRole("button", {
      name: en.questionCard.deleteMessageLabel,
    });
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.deleteConfirmTitle)).toBeInTheDocument();
    });
  });

  it("confirming delete from modal calls performDelete with fromModal=true; onSuccess closes modal", async () => {
    localStorage.setItem("confirmBeforeDelete", JSON.stringify(true));
    let capturedCallbacks: any;
    const mockDeleteMutate = vi.fn((_tid: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    setupMocks();
    mockUseDeleteMessage.mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);
    await act(async () => {});

    fireEvent.click(screen.getAllByRole("button", { name: en.questionCard.deleteMessageLabel })[0]);
    await waitFor(() => screen.getByText(en.messagesPage.deleteConfirmTitle));

    fireEvent.click(screen.getByRole("button", { name: en.common.delete }));
    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onSuccess();
    });
    await waitFor(() => {
      expect(screen.queryByText(en.messagesPage.deleteConfirmTitle)).toBeNull();
    });
  });

  it("performDelete from modal onError closes modal and shows toast", async () => {
    localStorage.setItem("confirmBeforeDelete", JSON.stringify(true));
    let capturedCallbacks: any;
    const mockDeleteMutate = vi.fn((_tid: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    setupMocks();
    mockUseDeleteMessage.mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);
    await act(async () => {});

    fireEvent.click(screen.getAllByRole("button", { name: en.questionCard.deleteMessageLabel })[0]);
    await waitFor(() => screen.getByText(en.messagesPage.deleteConfirmTitle));

    fireEvent.click(screen.getByRole("button", { name: en.common.delete }));
    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onError({ error: "Delete failed" });
    });
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.deleteErrorTitle)).toBeInTheDocument();
      expect(screen.queryByText(en.messagesPage.deleteConfirmTitle)).toBeNull();
    });
  });

  it("ConfirmationModal Cancel button closes the modal", async () => {
    localStorage.setItem("confirmBeforeDelete", JSON.stringify(true));
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    fireEvent.click(screen.getAllByRole("button", { name: en.questionCard.deleteMessageLabel })[0]);
    await waitFor(() => screen.getByText(en.messagesPage.deleteConfirmTitle));

    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    await waitFor(() => {
      expect(screen.queryByText(en.messagesPage.deleteConfirmTitle)).toBeNull();
    });
  });

  it("performDelete onSuccess with respondingTid === tid clears the responding state", async () => {
    let capturedCallbacks: any;
    const mockDeleteMutate = vi.fn((_tid: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    setupMocks();
    mockUseDeleteMessage.mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    // Expand msg-1 via the "↩ Reply" button
    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    const openReplyBtn = replyButtons.find((b) => b.textContent?.includes("↩"));
    fireEvent.click(openReplyBtn!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));

    // Delete the same expanded card (msg-1 is first)
    const deleteButtons = screen.getAllByRole("button", {
      name: en.questionCard.deleteMessageLabel,
    });
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onSuccess();
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      ).toBeNull();
    });
  });

  it("performDelete onError (from modal) falls back to a default message when err.error is missing", async () => {
    localStorage.setItem("confirmBeforeDelete", JSON.stringify(true));
    let capturedCallbacks: any;
    const mockDeleteMutate = vi.fn((_tid: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    setupMocks();
    mockUseDeleteMessage.mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);
    await act(async () => {});

    fireEvent.click(screen.getAllByRole("button", { name: en.questionCard.deleteMessageLabel })[0]);
    await waitFor(() => screen.getByText(en.messagesPage.deleteConfirmTitle));
    fireEvent.click(screen.getByRole("button", { name: en.common.delete }));
    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onError({});
    });
    await waitFor(() => {
      expect(screen.getByText(en.errors.generic)).toBeInTheDocument();
      expect(screen.queryByText(en.messagesPage.deleteConfirmTitle)).toBeNull();
    });
  });

  it("Cancel does not close the confirmation modal while a delete mutation is globally pending", async () => {
    localStorage.setItem("confirmBeforeDelete", JSON.stringify(true));
    setupMocks();
    mockUseDeleteMessage.mockReturnValue({ mutate: vi.fn(), isPending: true } as any);
    renderWithProviders(<Messages />);
    await act(async () => {});

    fireEvent.click(screen.getAllByRole("button", { name: en.questionCard.deleteMessageLabel })[0]);
    await waitFor(() => screen.getByText(en.messagesPage.deleteConfirmTitle));

    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    expect(screen.getByText(en.messagesPage.deleteConfirmTitle)).toBeInTheDocument();
  });
});
