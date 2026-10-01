import { screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// eslint-disable-next-line import/order
import * as authService from "../api/authService";

vi.mock("../api/authService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/authService")>();
  return { ...actual, useSession: vi.fn(), useSwitchAccount: vi.fn() };
});

vi.mock("../api/messageService", () => ({
  useGetMessages: vi.fn(() => ({ data: [], isLoading: false })),
  useSyncMessages: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRespondToMessage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useSendMessage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteMessage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteAccount: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useAddExampleMessages: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock("../api/profileService", () => ({
  usePublicProfile: vi.fn(() => ({ data: null, isLoading: false })),
  useCheckUserExists: vi.fn(() => ({ data: null, isLoading: false })),
  useFriends: vi.fn(() => ({ data: [], isLoading: false })),
}));
vi.mock("../api/settingsService", () => ({
  useGetSettings: vi.fn(() => ({ data: null, isLoading: false })),
  useGetStats: vi.fn(() => ({ data: null, isLoading: false })),
  useGetPdsInfo: vi.fn(() => ({ data: null, isLoading: false })),
  useUpdateSettings: vi.fn(() => ({ mutate: vi.fn() })),
  useUserStats: vi.fn(() => ({ data: null, isLoading: false })),
}));

vi.mock("@mantine/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/notifications")>();
  return { ...actual, showNotification: vi.fn() };
});

import { AppLayout } from "../AppLayout";
import { en } from "../lib/i18n/en";

import { renderWithProviders } from "./testUtils";

const mockUseSession = vi.mocked(authService.useSession);
const mockUseSwitchAccount = vi.mocked(authService.useSwitchAccount);

describe("AppLayout", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { isLoggedIn: false, profile: null, did: null },
      isLoading: false,
    } as any);
    mockUseSwitchAccount.mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
    window.history.replaceState({}, "", "/");
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<AppLayout />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders the navigation sidebar", () => {
    renderWithProviders(<AppLayout />);
    const nav = document.querySelector("nav, aside");
    expect(nav).not.toBeNull();
  });

  it("renders Login link on home route when not logged in", () => {
    renderWithProviders(<AppLayout />, { route: "/" });
    expect(screen.getAllByText("Login").length).toBeGreaterThan(0);
  });

  it("renders 404 page on unknown route", () => {
    renderWithProviders(<AppLayout />, { route: "/this-does-not-exist" });
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });

  it("offers no inbox link on the 404 page to a signed-out visitor", () => {
    renderWithProviders(<AppLayout />, { route: "/this-does-not-exist" });
    expect(screen.queryByText(en.notFoundPage.yourMessages)).toBeNull();
  });

  it("offers the inbox link on the 404 page to a signed-in user", () => {
    mockUseSession.mockReturnValue({
      data: { isLoggedIn: true, profile: { handle: "user.bsky.social" }, did: "did:example:123" },
      isLoading: false,
    } as any);
    renderWithProviders(<AppLayout />, { route: "/this-does-not-exist" });
    expect(screen.getByText(en.notFoundPage.yourMessages)).toBeInTheDocument();
  });

  it("adds mousedown listener when nav is opened via burger click", async () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");
    renderWithProviders(<AppLayout />);

    const buttons = document.querySelectorAll("button");
    const burgerBtn = Array.from(buttons).find(
      (b) => b.getAttribute("aria-label") !== "Toggle color scheme"
    );

    if (burgerBtn) {
      await act(async () => {
        fireEvent.click(burgerBtn);
      });
      expect(addListenerSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    }

    addListenerSpy.mockRestore();
  });

  it("cleanup removes mousedown listener on unmount", async () => {
    const removeListenerSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderWithProviders(<AppLayout />);

    unmount();

    expect(removeListenerSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    removeListenerSpy.mockRestore();
  });

  it("renders Navigation with handle when user is logged in", () => {
    mockUseSession.mockReturnValue({
      data: {
        isLoggedIn: true,
        profile: {
          did: "did:example:123",
          handle: "user.bsky.social",
          displayName: "Test User",
        },
        did: "did:example:123",
      },
      isLoading: false,
    } as any);
    const { container } = renderWithProviders(<AppLayout />);
    expect(container.firstChild).not.toBeNull();
  });

  it("closes nav when clicking outside navbar and burger after nav is open", async () => {
    renderWithProviders(<AppLayout />);

    const buttons = document.querySelectorAll("button");
    const burgerBtn = Array.from(buttons).find(
      (b) => b.getAttribute("aria-label") !== "Toggle color scheme"
    );

    if (burgerBtn) {
      await act(async () => {
        fireEvent.click(burgerBtn);
      });

      await act(async () => {
        fireEvent.mouseDown(document.body);
      });

      expect(document.body).toBeInTheDocument();
    }
  });

  it("clicking a nav link (Home) triggers onLinkClick → setNavOpen(false)", async () => {
    renderWithProviders(<AppLayout />, { route: "/" });
    const homeLinks = screen.getAllByText("Home");
    await act(async () => {
      fireEvent.click(homeLinks[0]);
    });
    expect(document.body).toBeInTheDocument();
  });

  it("mousedown inside the navbar does not close the nav", async () => {
    renderWithProviders(<AppLayout />);

    const buttons = document.querySelectorAll("button");
    const burgerBtn = Array.from(buttons).find(
      (b) => b.getAttribute("aria-label") !== "Toggle color scheme"
    );

    if (burgerBtn) {
      await act(async () => {
        fireEvent.click(burgerBtn);
      });

      const navEl = document.querySelector("nav");
      if (navEl) {
        await act(async () => {
          fireEvent.mouseDown(navEl);
        });
      }

      expect(document.body).toBeInTheDocument();
    }
  });

  it("mousedown on the burger button does not close the nav", async () => {
    renderWithProviders(<AppLayout />);

    const buttons = document.querySelectorAll("button");
    const burgerBtn = Array.from(buttons).find(
      (b) => b.getAttribute("aria-label") !== "Toggle color scheme"
    );

    if (burgerBtn) {
      await act(async () => {
        fireEvent.click(burgerBtn);
      });

      await act(async () => {
        fireEvent.mouseDown(burgerBtn);
      });

      expect(document.body).toBeInTheDocument();
    }
  });

  it("clicking the Login button in AppHeader triggers onNavClose → setNavOpen(false)", async () => {
    renderWithProviders(<AppLayout />, { route: "/" });
    const loginElements = screen.getAllByText("Login");
    const loginBtn = loginElements.find((el) => el.closest("a") || el.closest("button"));
    if (loginBtn) {
      await act(async () => {
        fireEvent.click(loginBtn);
      });
    }
    expect(document.body).toBeInTheDocument();
  });

  it("fires a 'Switched to' toast when the URL carries the accountSwitched marker", async () => {
    const { showNotification } = await import("@mantine/notifications");
    window.history.replaceState({}, "", "/?accountSwitched=tester.bsky.social");

    renderWithProviders(<AppLayout />);

    expect(vi.mocked(showNotification)).toHaveBeenCalledWith({
      message: en.common.switchedToAccount("tester.bsky.social"),
      color: "green",
    });
    expect(window.location.search).toBe("");
  });

  it("switches account when the URL carries a notifyDid marker", async () => {
    const mutate = vi.fn();
    mockUseSwitchAccount.mockReturnValue({ mutate, isPending: false } as any);
    window.history.replaceState(
      {},
      "",
      "/messages?notifyDid=did:plc:foo&notifyHandle=foo.bsky.social"
    );

    renderWithProviders(<AppLayout />);

    expect(mutate).toHaveBeenCalledWith(
      { did: "did:plc:foo" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(window.location.search).toBe("");
  });

  it("does not show the accountSwitched toast when a notifyDid switch is pending", async () => {
    const { showNotification } = await import("@mantine/notifications");
    vi.mocked(showNotification).mockClear();
    mockUseSwitchAccount.mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
    window.history.replaceState(
      {},
      "",
      "/messages?notifyDid=did:plc:foo&accountSwitched=old.bsky.social"
    );

    renderWithProviders(<AppLayout />);

    expect(vi.mocked(showNotification)).not.toHaveBeenCalled();
  });

  describe("onSuccess of a notifyDid switch", () => {
    const originalLocation = window.location;

    // The `location` setter is typed `string & Location`, so assigning a Location needs this cast.
    function assignLocation(next: Location): void {
      window.location = next as unknown as string & Location;
    }

    /** Swaps in a `location` whose `href` setter records instead of navigating; returns a reader. */
    function captureHrefWrites(): () => string {
      let captured = "";
      assignLocation({
        ...originalLocation,
        get href() {
          return captured || originalLocation.href;
        },
        set href(value: string) {
          captured = value;
        },
      } as unknown as Location);
      return () => captured;
    }

    afterEach(() => {
      assignLocation(originalLocation);
    });

    it("navigates to the accountSwitched URL when the notification carried a handle", () => {
      const capturedHref = captureHrefWrites();

      const mutate = vi.fn((_vars, { onSuccess }) => onSuccess());
      mockUseSwitchAccount.mockReturnValue({ mutate, isPending: false } as any);
      window.history.replaceState(
        {},
        "",
        "/messages?notifyDid=did:plc:foo&notifyHandle=foo.bsky.social"
      );

      renderWithProviders(<AppLayout />);

      expect(capturedHref()).toBe("/messages?accountSwitched=foo.bsky.social");
    });

    it("leaves the URL unchanged when the notification carried no handle", () => {
      const capturedHref = captureHrefWrites();

      const mutate = vi.fn((_vars, { onSuccess }) => onSuccess());
      mockUseSwitchAccount.mockReturnValue({ mutate, isPending: false } as any);
      window.history.replaceState({}, "", "/messages?notifyDid=did:plc:foo");

      renderWithProviders(<AppLayout />);

      expect(capturedHref()).toBe(originalLocation.href);
    });
  });
});
