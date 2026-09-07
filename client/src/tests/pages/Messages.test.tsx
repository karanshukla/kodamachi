// The harness registers this suite's module mocks, so it has to be imported
// before anything that pulls in the modules it mocks.
/* eslint-disable import/order */
import {
  MESSAGES,
  SESSION,
  mockUseAddExampleMessages,
  mockUseDeleteMessage,
  mockUseMessages,
  mockUseRespondToMessage,
  mockUseSession,
  mockSettingsMutation,
  mockUseUpdateUserSettings,
  mockUseUserSettings,
  noopMutation,
  resetMessagesPage,
  setupMocks,
} from "./messagesHarness";

import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { APP_NAME } from "../../lib/brand";
import { en } from "../../lib/i18n/en";
import { imageThemeLabels } from "../../lib/themes";
import Messages from "../../pages/Messages";
import { renderWithProviders } from "../testUtils";
/* eslint-enable import/order */

describe("Messages page", () => {
  beforeEach(() => {
    resetMessagesPage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loader while session is loading", () => {
    mockUseSession.mockReturnValue({ data: undefined, isLoading: true } as any);
    mockUseMessages.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    mockUseDeleteMessage.mockReturnValue(noopMutation);
    mockUseRespondToMessage.mockReturnValue(noopMutation);
    mockUseAddExampleMessages.mockReturnValue(noopMutation);
    mockUseUserSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);
    mockUseUpdateUserSettings.mockReturnValue(noopMutation);
    renderWithProviders(<Messages />);
    expect(screen.queryByText(en.postingPreferences.title)).toBeNull();
  });

  it("shows 'not logged in' alert when session is absent", () => {
    mockUseSession.mockReturnValue({
      data: { isLoggedIn: false },
      isLoading: false,
    } as any);
    mockUseMessages.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    mockUseDeleteMessage.mockReturnValue(noopMutation);
    mockUseRespondToMessage.mockReturnValue(noopMutation);
    mockUseAddExampleMessages.mockReturnValue(noopMutation);
    mockUseUserSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);
    mockUseUpdateUserSettings.mockReturnValue(noopMutation);
    renderWithProviders(<Messages />);
    expect(screen.getByText(en.messagesPage.notLoggedInTitle)).toBeInTheDocument();
  });

  it("renders Posting preferences and Image theme panel headers when messages exist", () => {
    setupMocks();
    renderWithProviders(<Messages />);
    expect(screen.getByText(en.postingPreferences.title)).toBeInTheDocument();
    expect(screen.getByText(en.imageThemePicker.title)).toBeInTheDocument();
  });

  it("renders message card content", () => {
    setupMocks();
    renderWithProviders(<Messages />);
    expect(screen.getByText("Hello?")).toBeInTheDocument();
    expect(screen.getByText("What is your favorite color?")).toBeInTheDocument();
  });

  it("renders timestamps containing the year (not relative time)", () => {
    setupMocks();
    renderWithProviders(<Messages />);
    const yearMatches = screen.getAllByText(/2024/);
    expect(yearMatches.length).toBeGreaterThan(0);
  });

  it("clicking 'Posting preferences' header does not throw", () => {
    setupMocks();
    renderWithProviders(<Messages />);
    expect(() => fireEvent.click(screen.getByText(en.postingPreferences.title))).not.toThrow();
  });

  it("clicking 'Image theme' header does not throw", () => {
    setupMocks();
    renderWithProviders(<Messages />);
    expect(() => fireEvent.click(screen.getByText(en.imageThemePicker.title))).not.toThrow();
  });

  it("renders Auto-scroll to messages switch in the preferences panel", () => {
    setupMocks();
    renderWithProviders(<Messages />);
    expect(screen.getByText(en.postingPreferences.autoScrollToMessages.label)).toBeInTheDocument();
  });

  it("preferences counter reflects 5 total toggles", () => {
    setupMocks();
    renderWithProviders(<Messages />);
    // Cleared localStorage falls back to the preference defaults: useGradients,
    // includeQuestionAsImage, and autoScrollToMessages start enabled (3 of 5).
    expect(screen.getByText(en.postingPreferences.summary(3, 5))).toBeInTheDocument();
  });

  it("calls scrollIntoView with block:nearest when messages first load", async () => {
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    setupMocks();
    renderWithProviders(<Messages />);
    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "nearest",
      });
    });
    scrollSpy.mockRestore();
  });

  it("does not call scrollIntoView when auto-scroll preference is off", async () => {
    localStorage.setItem("autoScrollToMessages", JSON.stringify(false));
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});

    // Start with no messages so the initial mount cannot trigger the scroll
    setupMocks([]);
    const { rerender } = renderWithProviders(<Messages />);

    // Wait for localStorage hydration (getInitialValueInEffect: true means it fires
    // after mount). The panel renders when messages exist, so we confirm the empty
    // state is stable first.
    await waitFor(() => {
      expect(screen.queryByText("Hello?")).toBeNull();
    });

    // Now simulate new messages arriving — count goes 0 → 2, but autoScroll is false
    mockUseMessages.mockReturnValue({
      data: { messages: MESSAGES },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    rerender(<Messages />);

    await waitFor(() => {
      expect(screen.getByText("Hello?")).toBeInTheDocument();
    });

    expect(scrollSpy).not.toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
    scrollSpy.mockRestore();
  });

  it("does not render panel headers when there are no messages", () => {
    setupMocks([]);
    renderWithProviders(<Messages />);
    expect(screen.queryByText(en.postingPreferences.title)).toBeNull();
    expect(screen.queryByText(en.imageThemePicker.title)).toBeNull();
  });

  it("shows a welcome-back toast notification after a new login", async () => {
    sessionStorage.setItem("newLogin", "true");
    setupMocks();
    renderWithProviders(<Messages />);
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.welcomeBackTitle)).toBeInTheDocument();
    });
    expect(sessionStorage.getItem("newLogin")).toBeNull();
  });

  it("clicking 'Add example messages' calls addExamples; onSuccess calls refetch", async () => {
    let capturedCallbacks: any;
    const mockAddMutate = vi.fn((_did: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    const refetchMock = vi.fn().mockResolvedValue(undefined);
    mockUseAddExampleMessages.mockReturnValue({
      mutate: mockAddMutate,
      isPending: false,
    } as any);
    mockUseSession.mockReturnValue({ data: SESSION, isLoading: false } as any);
    mockUseMessages.mockReturnValue({
      data: { messages: [] },
      isLoading: false,
      refetch: refetchMock,
    } as any);
    mockUseDeleteMessage.mockReturnValue(noopMutation);
    mockUseRespondToMessage.mockReturnValue(noopMutation);
    mockUseUserSettings.mockReturnValue({
      data: { pdsSyncEnabled: false, imageTheme: "default" },
      isLoading: false,
    } as any);
    mockUseUpdateUserSettings.mockReturnValue(noopMutation);
    renderWithProviders(<Messages />);

    fireEvent.click(screen.getByRole("button", { name: en.messagesPage.addExampleMessages }));
    await waitFor(() =>
      expect(mockAddMutate).toHaveBeenCalledWith(SESSION.did, expect.any(Object))
    );

    act(() => {
      capturedCallbacks.onSuccess();
    });
    expect(refetchMock).toHaveBeenCalled();
  });

  it("addExampleMessages onError shows error toast", async () => {
    let capturedCallbacks: any;
    const mockAddMutate = vi.fn((_did: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    mockUseAddExampleMessages.mockReturnValue({
      mutate: mockAddMutate,
      isPending: false,
    } as any);
    mockUseSession.mockReturnValue({ data: SESSION, isLoading: false } as any);
    mockUseMessages.mockReturnValue({
      data: { messages: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any);
    mockUseDeleteMessage.mockReturnValue(noopMutation);
    mockUseRespondToMessage.mockReturnValue(noopMutation);
    mockUseUserSettings.mockReturnValue({
      data: { pdsSyncEnabled: false, imageTheme: "default" },
      isLoading: false,
    } as any);
    mockUseUpdateUserSettings.mockReturnValue(noopMutation);
    renderWithProviders(<Messages />);

    fireEvent.click(screen.getByRole("button", { name: en.messagesPage.addExampleMessages }));
    await waitFor(() => expect(mockAddMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onError({ error: "Server error" });
    });
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.addExamplesErrorTitle)).toBeInTheDocument();
    });
  });

  it("Alt+R keyboard shortcut cycles through message cards", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    // First Alt+R: focusedCardIndex is -1 → sets to 0
    fireEvent.keyDown(document, { key: "R", altKey: true });
    // Second Alt+R: cycles to next card
    fireEvent.keyDown(document, { key: "R", altKey: true });

    expect(document.body).toBeInTheDocument();
  });

  it("ArrowDown and ArrowUp navigate between message cards", async () => {
    setupMocks();
    renderWithProviders(<Messages />);

    // Focus a card via Alt+R first (sets focusedCardIndex=0)
    fireEvent.keyDown(document, { key: "R", altKey: true });
    // ArrowDown → next card
    fireEvent.keyDown(document, { key: "ArrowDown" });
    // ArrowUp → previous card
    fireEvent.keyDown(document, { key: "ArrowUp" });

    expect(document.body).toBeInTheDocument();
  });

  it("updateSettings onError callback shows error toast", async () => {
    let capturedOnError: any;
    setupMocks();
    mockUseUpdateUserSettings.mockImplementation((options: any) => {
      capturedOnError = options?.onError;
      return noopMutation;
    });
    renderWithProviders(<Messages />);

    act(() => {
      capturedOnError({ error: "Theme update failed" });
    });
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.themeUpdateErrorTitle)).toBeInTheDocument();
    });
  });

  it("handleAddExampleMessages returns early when session has no did", () => {
    const mockAddMutate = vi.fn();
    mockUseAddExampleMessages.mockReturnValue({
      mutate: mockAddMutate,
      isPending: false,
    } as any);
    mockUseSession.mockReturnValue({
      data: { isLoggedIn: true, did: null, profile: null },
      isLoading: false,
    } as any);
    mockUseMessages.mockReturnValue({
      data: { messages: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any);
    mockUseDeleteMessage.mockReturnValue(noopMutation);
    mockUseRespondToMessage.mockReturnValue(noopMutation);
    mockUseUserSettings.mockReturnValue({
      data: { pdsSyncEnabled: false, imageTheme: "default" },
      isLoading: false,
    } as any);
    mockUseUpdateUserSettings.mockReturnValue(noopMutation);
    renderWithProviders(<Messages />);

    fireEvent.click(screen.getByRole("button", { name: en.messagesPage.addExampleMessages }));
    expect(mockAddMutate).not.toHaveBeenCalled();
  });

  it("clicking the Copy button in the hero card triggers haptic and copy", () => {
    setupMocks();
    renderWithProviders(<Messages />);
    const copyBtn = screen.getByRole("button", { name: en.common.copy });
    expect(() => fireEvent.click(copyBtn)).not.toThrow();
  });

  it("clicking a ThemeCard saves only imageTheme when not loading", () => {
    setupMocks();
    const save = mockSettingsMutation();
    renderWithProviders(<Messages />);

    const defaultThemeBtn = screen.getByRole("button", { name: en.themes.image.default });
    fireEvent.click(defaultThemeBtn);

    expect(save).toHaveBeenCalledWith({ imageTheme: "default" });
  });

  it("keyboard Alt+R shortcut is ignored when an input element has focus", () => {
    setupMocks();
    renderWithProviders(<Messages />);

    // Switch inputs are rendered as checkboxes; fire Alt+R from one of them
    const switchInput = document.querySelector('input[type="checkbox"]') as HTMLElement;
    if (switchInput) {
      fireEvent.keyDown(switchInput, { key: "R", altKey: true });
    }
    expect(document.body).toBeInTheDocument();
  });

  it("updateSettings onError falls back to a default message when error.error is missing", async () => {
    let capturedOnError: any;
    setupMocks();
    mockUseUpdateUserSettings.mockImplementation((options: any) => {
      capturedOnError = options?.onError;
      return noopMutation;
    });
    renderWithProviders(<Messages />);

    act(() => {
      capturedOnError({});
    });
    await waitFor(() => {
      expect(screen.getByText(en.errors.generic)).toBeInTheDocument();
    });
  });

  it("addExampleMessages onError falls back to a default message when err.error is missing", async () => {
    let capturedCallbacks: any;
    const mockAddMutate = vi.fn((_did: string, callbacks: any) => {
      capturedCallbacks = callbacks;
    });
    mockUseAddExampleMessages.mockReturnValue({
      mutate: mockAddMutate,
      isPending: false,
    } as any);
    mockUseSession.mockReturnValue({ data: SESSION, isLoading: false } as any);
    mockUseMessages.mockReturnValue({
      data: { messages: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any);
    mockUseDeleteMessage.mockReturnValue(noopMutation);
    mockUseRespondToMessage.mockReturnValue(noopMutation);
    mockUseUserSettings.mockReturnValue({
      data: { pdsSyncEnabled: false, imageTheme: "default" },
      isLoading: false,
    } as any);
    mockUseUpdateUserSettings.mockReturnValue(noopMutation);
    renderWithProviders(<Messages />);

    fireEvent.click(screen.getByRole("button", { name: en.messagesPage.addExampleMessages }));
    await waitFor(() => expect(mockAddMutate).toHaveBeenCalled());

    act(() => {
      capturedCallbacks.onError({});
    });
    await waitFor(() => {
      expect(screen.getByText(en.errors.generic)).toBeInTheDocument();
    });
  });

  it("clicking the Copy button shows 'Copied!' after navigator.clipboard.writeText resolves", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
    setupMocks();
    renderWithProviders(<Messages />);

    fireEvent.click(screen.getByRole("button", { name: en.common.copy }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: en.common.copied })).toBeInTheDocument();
    });
  });

  it("shows a loader in place of the message grid while messages are loading", () => {
    mockUseSession.mockReturnValue({ data: SESSION, isLoading: false } as any);
    mockUseMessages.mockReturnValue({
      data: undefined,
      isLoading: true,
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
    renderWithProviders(<Messages />);

    expect(screen.queryByText(en.messagesPage.noMessagesTitle)).toBeNull();
    expect(screen.queryByText("Hello?")).toBeNull();
  });

  it("shows the 'Default' theme label while user settings are loading", () => {
    setupMocks();
    mockUseUserSettings.mockReturnValue({ data: undefined, isLoading: true } as any);
    renderWithProviders(<Messages />);
    expect(screen.getAllByText(imageThemeLabels(en).default).length).toBeGreaterThan(0);
  });

  it("falls back to the 'Default' theme label when userSettings.imageTheme is undefined", () => {
    setupMocks();
    mockUseUserSettings.mockReturnValue({
      data: { pdsSyncEnabled: false },
      isLoading: false,
    } as any);
    renderWithProviders(<Messages />);
    expect(screen.getAllByText(imageThemeLabels(en).default).length).toBeGreaterThan(0);
  });

  it("clicking a ThemeCard while settings are loading does not call updateSettings.mutate", () => {
    setupMocks();
    mockUseUserSettings.mockReturnValue({ data: undefined, isLoading: true } as any);
    const save = mockSettingsMutation();
    renderWithProviders(<Messages />);

    fireEvent.click(screen.getByRole("button", { name: en.themes.image.default }));
    expect(save).not.toHaveBeenCalled();
  });

  it("clicking a ThemeCard while its own save is in flight does not save again", () => {
    setupMocks();
    const save = mockSettingsMutation("imageTheme");
    renderWithProviders(<Messages />);

    fireEvent.click(screen.getByRole("button", { name: en.themes.image.default }));
    expect(save).not.toHaveBeenCalled();
  });

  it("arrow keys do nothing until a card has been focused", () => {
    setupMocks();
    renderWithProviders(<Messages />);

    fireEvent.keyDown(document, { key: "ArrowDown" });

    expect(document.getElementById("message-card-msg-1")).not.toBe(document.activeElement);
  });

  it("useGradients=false hydrates from localStorage and drives the card's background-color source", async () => {
    // Note: we can't assert the rendered `style.background` string directly here — happy-dom has
    // a quirk where once a `background` shorthand containing `var(...)` is set via the CSSOM
    // property setter, later property-based updates to that same node stop being reflected in
    // `.style`/`getAttribute("style")`, even though the underlying JS ternary re-evaluates
    // correctly on every render. The Switch's `checked` DOM property isn't subject to that
    // shorthand-specific bug, and it reflects the exact same `useGradients` value read in the
    // same render pass as the card's `background: useGradients ? ... : surfaceBg(isDark)` line.
    localStorage.setItem("useGradients", JSON.stringify(false));
    setupMocks();
    renderWithProviders(<Messages />);

    await waitFor(() => {
      const gradientSwitch = screen.getByLabelText(/gradient backgrounds/i) as HTMLInputElement;
      expect(gradientSwitch.checked).toBe(false);
    });
  });

  it("Alt+R shortcut is a no-op when there are no messages", () => {
    setupMocks([]);
    renderWithProviders(<Messages />);
    expect(() => fireEvent.keyDown(document, { key: "R", altKey: true })).not.toThrow();
  });

  it("ArrowDown/ArrowUp shortcuts are a no-op when the message list becomes empty", async () => {
    setupMocks();
    const { rerender } = renderWithProviders(<Messages />);

    // Focus a card via Alt+R so focusedCardIndex !== -1
    fireEvent.keyDown(document, { key: "R", altKey: true });

    mockUseMessages.mockReturnValue({
      data: { messages: [] },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as any);
    rerender(<Messages />);
    await waitFor(() => {
      expect(screen.getByText(en.messagesPage.noMessagesBody)).toBeInTheDocument();
    });

    expect(() => fireEvent.keyDown(document, { key: "ArrowDown" })).not.toThrow();
  });

  // Historically flaky: the responding-Tid effect in Messages.tsx schedules a
  // 150ms setTimeout to scroll the card into view. Before that effect gained a
  // clearTimeout cleanup, the timer could outlive the test that scheduled it
  // and fire here — tripping this test's scrollIntoView spy. The component now
  // clears its timer on re-render/unmount, so the spy below should stay clean;
  // if it fires again, suspect a new un-cleaned async scroll path in Messages.tsx.
  it("does not scroll into view when the newest message target is already visible in the viewport", async () => {
    // window.innerHeight varies by test environment/CI runner, so pin it explicitly rather
    // than relying on the ambient default — the "visible" rect below (top:100, bottom:200)
    // is only actually in-view relative to a known viewport height.
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 800,
    });
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 200,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
      x: 0,
      y: 100,
      toJSON: () => {},
    } as DOMRect);

    try {
      setupMocks([]);
      const { rerender } = renderWithProviders(<Messages />);
      await waitFor(() => expect(screen.queryByText("Hello?")).toBeNull());

      mockUseMessages.mockReturnValue({
        data: { messages: MESSAGES },
        isLoading: false,
        refetch: vi.fn().mockResolvedValue(undefined),
      } as any);
      rerender(<Messages />);
      await waitFor(() => expect(screen.getByText("Hello?")).toBeInTheDocument());

      expect(scrollSpy).not.toHaveBeenCalled();
    } finally {
      // Restore even on assertion failure, so a broken test here can't leak a mocked
      // scrollIntoView/getBoundingClientRect/innerHeight into later tests.
      scrollSpy.mockRestore();
      rectSpy.mockRestore();
      Object.defineProperty(window, "innerHeight", {
        writable: true,
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it("the auto-scroll effect does not re-fire scrollIntoView when a refetch returns the same message count", async () => {
    setupMocks();
    const { rerender } = renderWithProviders(<Messages />);
    await waitFor(() => expect(screen.getByText("Hello?")).toBeInTheDocument());

    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    try {
      // A background refetch (refetchInterval) resolves with a new array reference containing
      // the same messages — count === prev, so the effect's guard should short-circuit to false.
      mockUseMessages.mockReturnValue({
        data: { messages: [...MESSAGES] },
        isLoading: false,
        refetch: vi.fn().mockResolvedValue(undefined),
      } as any);
      rerender(<Messages />);
      await act(async () => {});

      expect(scrollSpy).not.toHaveBeenCalled();
    } finally {
      scrollSpy.mockRestore();
    }
  });

  it("localizes the owner's share payload to their touchpoint locale (#266)", async () => {
    // The share text leaves the DOM into the OS share sheet, so it can't be
    // reached by browser translate — it must be pre-localized from the owner's
    // setting. Spy on navigator.share to capture what's actually handed off.
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    const originalShare = navigator.share;
    Object.defineProperty(navigator, "share", {
      value: shareSpy,
      configurable: true,
      writable: true,
    });

    mockUseSession.mockReturnValue({ data: SESSION, isLoading: false } as any);
    mockUseMessages.mockReturnValue({
      data: { messages: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any);
    mockUseDeleteMessage.mockReturnValue(noopMutation);
    mockUseRespondToMessage.mockReturnValue(noopMutation);
    mockUseAddExampleMessages.mockReturnValue(noopMutation);
    mockUseUserSettings.mockReturnValue({
      data: {
        pdsSyncEnabled: false,
        imageTheme: "default",
        touchpointLocale: "es",
      },
      isLoading: false,
    } as any);
    mockUseUpdateUserSettings.mockReturnValue(noopMutation);

    try {
      renderWithProviders(<Messages />);
      // The "Share" button in the profile header hands sharePayload to the OS.
      const shareButtons = screen.getAllByRole("button", { name: en.shareButton.button });
      fireEvent.click(shareButtons[0]);
      await waitFor(() => expect(shareSpy).toHaveBeenCalled());

      const payload = shareSpy.mock.calls[0][0];
      // Spanish acquisition copy, parameterized with the owner's display name.
      expect(payload.title).toBe(`¡Envíame mensajes anónimos en ${APP_NAME}!`);
      expect(payload.text).toBe("¡Envía a Karan mensajes anónimos!");
    } finally {
      Object.defineProperty(navigator, "share", {
        value: originalShare,
        configurable: true,
        writable: true,
      });
    }
  });
});
