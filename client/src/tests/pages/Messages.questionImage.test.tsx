// Import the harness first: it registers this suite's module mocks.
/* eslint-disable import/order */
import * as harness from "./messagesHarness";
import {
  RENDER_ID,
  isReplyTriggerName,
  mockUseRespondToMessage,
  openComposerFor,
  queueSendOnAStuckRender,
  resetMessagesPage,
  setupMocks,
  startRenderMutate,
  togglePreference,
  typeAndSend,
} from "./messagesHarness";

import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as messageService from "../../api/messageService";
import { en } from "../../lib/i18n/en";
import Messages from "../../pages/Messages";
import { renderWithProviders } from "../testUtils";
/* eslint-enable import/order */

describe("Messages page — the question-image render pipeline", () => {
  beforeEach(() => {
    resetMessagesPage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opening another question while a send waits on its render does not move the composer", async () => {
    const mockRespondMutate = vi.fn();
    await queueSendOnAStuckRender(mockRespondMutate);

    fireEvent.click(screen.getByText("What is your favorite color?"));

    const textarea = screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel });
    expect(document.getElementById("message-card-msg-1")!.contains(textarea)).toBe(true);
  });

  it("posts the queued reply with its own question's render, not a later question's", async () => {
    const mockRespondMutate = vi.fn();
    const textarea = await queueSendOnAStuckRender(mockRespondMutate);

    // Without the refused click the render retargets to msg-2 and msg-1's reply would carry msg-2's image.
    fireEvent.click(screen.getByText("What is your favorite color?"));

    harness.render.poll = () => ({ status: "ready" });
    fireEvent.change(textarea, { target: { value: "My answer, still typing" } });

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalledTimes(1));
    expect(mockRespondMutate.mock.calls[0][0]).toMatchObject({
      tid: "msg-1",
      original: "Hello?",
      renderId: RENDER_ID,
    });
  });

  it("sends the queued reply text-only when the image toggle goes off mid-wait", async () => {
    const mockRespondMutate = vi.fn();
    await queueSendOnAStuckRender(mockRespondMutate);

    // This render never settles, so an unreleased status would leave the send stuck with no retry.
    await togglePreference(en.postingPreferences.includeQuestionAsImage.label);

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalledTimes(1));
    expect(mockRespondMutate.mock.calls[0][0]).toMatchObject({
      tid: "msg-1",
      includeQuestionAsImage: false,
    });
    expect(mockRespondMutate.mock.calls[0][0].renderId).toBeUndefined();
  });

  it("opening the composer warms the image service when replies carry an image", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);

    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    expect(messageService.messageService.warmImageService).toHaveBeenCalledTimes(1);
  });

  it("does not warm the image service when replies are text only", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    await togglePreference(en.postingPreferences.includeQuestionAsImage.label);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);

    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));
    expect(messageService.messageService.warmImageService).not.toHaveBeenCalled();
  });

  it("character limit decreases when includeQuestionAsImage is toggled off while responding", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    const replyButtons = screen.getAllByRole("button", { name: isReplyTriggerName });
    fireEvent.click(replyButtons.find((b) => b.textContent?.includes("↩"))!);
    await waitFor(() => screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }));

    expect(screen.getByText("0/277")).toBeInTheDocument();

    await togglePreference(en.postingPreferences.includeQuestionAsImage.label);

    await waitFor(() => {
      expect(screen.queryByText("0/277")).toBeNull();
    });
  });

  it("posts a reply that carries an image with the render key the server already holds", async () => {
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    await openComposerFor();
    await typeAndSend();

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());
    expect(mockRespondMutate.mock.calls[0][0].renderId).toBe(RENDER_ID);
  });

  it("posts a text-only reply straight away, with no render key", async () => {
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    renderWithProviders(<Messages />);

    await togglePreference(en.postingPreferences.includeQuestionAsImage.label);
    await openComposerFor();
    await typeAndSend();

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalled());
    expect(mockRespondMutate.mock.calls[0][0].renderId).toBeUndefined();
    expect(startRenderMutate).not.toHaveBeenCalled();
  });

  it("holds the reply back until the question image is rendered, and says so", async () => {
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    harness.render.poll = () => ({ status: "rendering" });
    const { rerender } = renderWithProviders(<Messages />);

    await openComposerFor();
    await typeAndSend();

    expect(mockRespondMutate).not.toHaveBeenCalled();
    expect(screen.getByText(en.replyComposer.renderingImage)).toBeInTheDocument();

    harness.render.poll = () => ({ status: "ready" });
    rerender(<Messages />);

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalledTimes(1));
  });

  it("pressing Enter twice while the question image is still rendering posts once", async () => {
    // #360: the composer is silent for the whole render, and nothing downstream is idempotent.
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    harness.render.poll = () => ({ status: "rendering" });
    const { rerender } = renderWithProviders(<Messages />);

    await openComposerFor();
    const textarea = screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel });
    fireEvent.change(textarea, { target: { value: "My answer!" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    harness.render.poll = () => ({ status: "ready" });
    rerender(<Messages />);

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalledTimes(1));
  });

  it("surfaces the specific error a failed render carries, and asks for a fresh one", async () => {
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    harness.render.poll = () => ({ status: "failed", error: "image service unreachable" });
    renderWithProviders(<Messages />);

    await openComposerFor();
    await typeAndSend();

    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.imageRenderFailedTitle)).toBeInTheDocument();
      expect(screen.getByText(/image service unreachable/i)).toBeInTheDocument();
    });
    expect(mockRespondMutate).not.toHaveBeenCalled();
    // Reading the failure clears it server-side, so the send requests a fresh render.
    expect(startRenderMutate.mock.calls.length).toBeGreaterThan(1);
  });

  it("falls back to a default message when a failed render carries no error", async () => {
    setupMocks();
    harness.render.poll = () => ({ status: "failed" });
    renderWithProviders(<Messages />);

    await openComposerFor();
    await typeAndSend();

    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.imageRenderFailedMessage)).toBeInTheDocument();
    });
  });

  it("keeps waiting instead of erroring when respond says the render is not ready yet", async () => {
    let capturedCallbacks: any;
    const mockRespondMutate = vi.fn((_data: any, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    harness.render.poll = (attempt) =>
      attempt === 0 ? { status: "ready" } : { status: "rendering" };
    const { rerender } = renderWithProviders(<Messages />);

    await openComposerFor();
    await typeAndSend();
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalledTimes(1));

    act(() => {
      capturedCallbacks.onError({ status: 409, error: "render not ready" });
    });

    expect(screen.queryByText(en.messagesPage.responseErrorTitle)).toBeNull();
    expect(screen.getByText(en.replyComposer.renderingImage)).toBeInTheDocument();

    harness.render.poll = () => ({ status: "ready" });
    rerender(<Messages />);
    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalledTimes(2));
  });

  it("starts a render when the image toggle is flipped on with the composer already open", async () => {
    localStorage.setItem("includeQuestionAsImage", JSON.stringify(false));
    setupMocks();
    renderWithProviders(<Messages />);
    await act(async () => {});

    await openComposerFor();
    expect(startRenderMutate).not.toHaveBeenCalled();

    await togglePreference(en.postingPreferences.includeQuestionAsImage.label);

    await waitFor(() => expect(startRenderMutate).toHaveBeenCalledTimes(1));
  });

  it("falls back to the server's synchronous render when the render cannot be queued", async () => {
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    harness.render.startFails = true;
    renderWithProviders(<Messages />);

    await openComposerFor();
    await typeAndSend();

    await waitFor(() => expect(mockRespondMutate).toHaveBeenCalledTimes(1));
    expect(mockRespondMutate.mock.calls[0][0].renderId).toBeUndefined();
    expect(mockRespondMutate.mock.calls[0][0].includeQuestionAsImage).toBe(true);
    expect(screen.queryByText(en.messagesPage.imageRenderFailedTitle)).toBeNull();
  });

  it("abandons a queued reply when the composer is closed before the render lands", async () => {
    const mockRespondMutate = vi.fn();
    setupMocks();
    mockUseRespondToMessage.mockReturnValue({
      mutate: mockRespondMutate,
      isPending: false,
    } as any);
    harness.render.poll = () => ({ status: "rendering" });
    const { rerender } = renderWithProviders(<Messages />);

    await openComposerFor();
    await typeAndSend();
    fireEvent.keyDown(screen.getByRole("textbox", { name: en.replyComposer.responseAriaLabel }), {
      key: "Escape",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: en.replyComposer.responseAriaLabel })
      ).toBeNull();
    });

    harness.render.poll = () => ({ status: "ready" });
    rerender(<Messages />);
    await act(async () => {});

    expect(mockRespondMutate).not.toHaveBeenCalled();
  });
});
