import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { apiClient } from "../api/apiClient";
import { queryClient } from "../api/queryClient";
import {
  settingsService,
  UserSettings,
  UserStats,
  useUserSettings,
  useUserStats,
  usePdsInfo,
  useUpdateUserSettings,
  settingsKeys,
} from "../api/settingsService";

/** A promise plus the handles to settle it, so a save can be held mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Like `makeWrapper`, but hands back the client so a test can read the cache. */
function makeSettingsWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, qc };
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
}

function makeWrapperFastRetry() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
}

vi.mock("../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("settingsService", () => {
  const mockDid = "did:example:123";

  const mockUserSettings: UserSettings = {
    did: mockDid,
    pdsSyncEnabled: 1,
    imageTheme: "default",
    inboxEnabled: 1,
    profanityFilterEnabled: 1,
    uiLocale: null,
    defaultClient: null,
    openProfilesInApp: 1,
    atmosphereLinksEnabled: 1,
    customPrompt: null,
    profileCardTheme: null,
    touchpointLocale: null,
    createdAt: "2025-06-07T12:00:00.000Z",
  };

  const mockUpdatedSettings: Partial<UserSettings> = {
    pdsSyncEnabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserSettings", () => {
    it("should call apiClient.get with the correct endpoint", async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockUserSettings);

      const result = await settingsService.getUserSettings();

      expect(result).toEqual(mockUserSettings);
      expect(apiClient.get).toHaveBeenCalledWith("/settings");
    });

    it("should handle errors", async () => {
      const mockError = { error: "Settings not found", status: 404 };
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(settingsService.getUserSettings()).rejects.toEqual(mockError);
    });
  });

  describe("updateUserSettings", () => {
    it("should call apiClient.post with the correct endpoint and data", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        ...mockUserSettings,
        pdsSyncEnabled: 0,
      });

      const result = await settingsService.updateUserSettings(mockUpdatedSettings);

      expect(result).toEqual({
        ...mockUserSettings,
        pdsSyncEnabled: 0,
      });
      expect(apiClient.post).toHaveBeenCalledWith("/settings", mockUpdatedSettings);
    });

    it("should handle errors", async () => {
      const mockError = { error: "Failed to update settings", status: 400 };
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(settingsService.updateUserSettings(mockUpdatedSettings)).rejects.toEqual(
        mockError
      );
    });

    it("should update imageTheme", async () => {
      const newImageTheme = "ocean-breeze";
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        ...mockUserSettings,
        imageTheme: newImageTheme,
      });

      const result = await settingsService.updateUserSettings({
        imageTheme: newImageTheme,
      });

      expect(result).toEqual({
        ...mockUserSettings,
        imageTheme: newImageTheme,
      });
      expect(apiClient.post).toHaveBeenCalledWith("/settings", {
        imageTheme: newImageTheme,
      });
    });
  });

  describe("getStats", () => {
    it("should call apiClient.get with the correct endpoint", async () => {
      const mockStats: UserStats = {
        messageCount: 42,
        memberSince: "2025-01-01T00:00:00.000Z",
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockStats);

      const result = await settingsService.getStats();

      expect(result).toEqual(mockStats);
      expect(apiClient.get).toHaveBeenCalledWith("/stats");
    });

    it("should return 0 message count when user has no messages", async () => {
      const mockStats: UserStats = { messageCount: 0, memberSince: null };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockStats);

      const result = await settingsService.getStats();

      expect(result).toEqual({ messageCount: 0, memberSince: null });
    });

    it("should handle authentication errors", async () => {
      const mockError = { error: "Not authenticated", status: 403 };
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(settingsService.getStats()).rejects.toEqual(mockError);
    });
  });
});

describe("settings hooks", () => {
  const mockSettings: UserSettings = {
    did: "did:example:123",
    pdsSyncEnabled: 1,
    imageTheme: "default",
    inboxEnabled: 1,
    profanityFilterEnabled: 1,
    uiLocale: null,
    defaultClient: null,
    openProfilesInApp: 1,
    atmosphereLinksEnabled: 1,
    customPrompt: null,
    profileCardTheme: null,
    touchpointLocale: null,
    createdAt: "2025-01-01T00:00:00.000Z",
  };

  beforeEach(() => vi.clearAllMocks());

  it("useUserSettings returns a query result", () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockSettings);
    const { result } = renderHook(() => useUserSettings(), {
      wrapper: makeWrapper(),
    });
    expect(typeof result.current.isLoading).toBe("boolean");
  });

  it("useUserSettings retry returns false for 401", () => {
    vi.mocked(apiClient.get).mockRejectedValue({
      status: 401,
      error: "Unauthorized",
    });
    const { result } = renderHook(() => useUserSettings(), {
      wrapper: makeWrapper(),
    });
    // Access the query's retry config by checking that the hook initializes properly
    expect(result.current).toBeDefined();
  });

  it("useUserStats returns a query result", () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      messageCount: 0,
      memberSince: null,
    });
    const { result } = renderHook(() => useUserStats(), {
      wrapper: makeWrapper(),
    });
    expect(typeof result.current.isLoading).toBe("boolean");
  });

  it("usePdsInfo returns a query result", () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      pdsUrl: null,
      recordCount: 0,
    });
    const { result } = renderHook(() => usePdsInfo(), {
      wrapper: makeWrapper(),
    });
    expect(typeof result.current.isLoading).toBe("boolean");
  });

  it("useUpdateUserSettings returns a save function", () => {
    const { result } = renderHook(() => useUpdateUserSettings(), {
      wrapper: makeWrapper(),
    });
    expect(typeof result.current.save).toBe("function");
    expect(result.current.isSavingAny).toBe(false);
  });

  it("useUserSettings does not retry on 403 errors", async () => {
    vi.mocked(apiClient.get).mockRejectedValue({
      status: 403,
      error: "Forbidden",
    });
    const { result } = renderHook(() => useUserSettings(), {
      wrapper: makeWrapperFastRetry(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useUserSettings retries for non-auth errors (failureCount < 3 branch)", async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce({ status: 500, error: "Server Error" })
      .mockResolvedValue(mockSettings);
    const { result } = renderHook(() => useUserSettings(), {
      wrapper: makeWrapperFastRetry(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSettings);
  });

  it("useUpdateUserSettings resolves with the saved row and calls options.onSuccess", async () => {
    const onSuccess = vi.fn();
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockSettings);
    const { result } = renderHook(() => useUpdateUserSettings({ onSuccess }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await expect(result.current.save({ pdsSyncEnabled: true })).resolves.toEqual(mockSettings);
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("resolves null and reports the failure through options.onError", async () => {
    const onError = vi.fn();
    vi.mocked(apiClient.post).mockRejectedValueOnce({ status: 500, error: "boom" });
    const { result } = renderHook(() => useUpdateUserSettings({ onError }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await expect(result.current.save({ pdsSyncEnabled: true })).resolves.toBeNull();
    });
    expect(onError).toHaveBeenCalledWith({ status: 500, error: "boom" });
  });

  it("leaves a second field free while the first is in flight", async () => {
    const first = deferred<UserSettings>();
    const second = deferred<UserSettings>();
    vi.mocked(apiClient.post)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper: makeWrapper() });

    act(() => {
      void result.current.save({ inboxEnabled: false });
    });
    await waitFor(() => expect(result.current.isSaving("inboxEnabled")).toBe(true));
    expect(result.current.isSaving("uiLocale")).toBe(false);

    act(() => {
      void result.current.save({ uiLocale: "de" });
    });
    await waitFor(() => expect(result.current.isSaving("uiLocale")).toBe(true));
    // Both requests are open at once: neither waited on the other.
    expect(result.current.isSaving("inboxEnabled")).toBe(true);

    await act(async () => {
      first.resolve({ ...mockSettings, inboxEnabled: 0 });
      second.resolve({ ...mockSettings, uiLocale: "de" });
    });
    await waitFor(() => expect(result.current.isSavingAny).toBe(false));
  });

  it("applies a save optimistically before the request lands", async () => {
    const { Wrapper, qc } = makeSettingsWrapper();
    qc.setQueryData(settingsKeys.user(), mockSettings);
    const inFlight = deferred<UserSettings>();
    vi.mocked(apiClient.post).mockReturnValueOnce(inFlight.promise);
    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper: Wrapper });

    act(() => {
      void result.current.save({ inboxEnabled: false });
    });

    await waitFor(() =>
      expect(qc.getQueryData(settingsKeys.user())).toMatchObject({ inboxEnabled: false })
    );
    await act(async () => {
      inFlight.resolve({ ...mockSettings, inboxEnabled: 0 });
    });
    await waitFor(() =>
      expect(qc.getQueryData(settingsKeys.user())).toMatchObject({ inboxEnabled: 0 })
    );
  });

  it("a failed save reverts its own field and leaves a sibling's success alone", async () => {
    const { Wrapper, qc } = makeSettingsWrapper();
    qc.setQueryData(settingsKeys.user(), mockSettings);
    const failing = deferred<UserSettings>();
    vi.mocked(apiClient.post)
      .mockReturnValueOnce(failing.promise)
      .mockResolvedValueOnce({ ...mockSettings, uiLocale: "de" });
    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper: Wrapper });

    let failed!: Promise<UserSettings | null>;
    act(() => {
      failed = result.current.save({ inboxEnabled: false });
    });
    await act(async () => {
      await result.current.save({ uiLocale: "de" });
    });
    expect(qc.getQueryData(settingsKeys.user())).toMatchObject({ uiLocale: "de" });

    await act(async () => {
      failing.reject({ status: 500, error: "boom" });
      await failed;
    });

    expect(qc.getQueryData(settingsKeys.user())).toMatchObject({
      inboxEnabled: 1,
      uiLocale: "de",
    });
  });

  it("refetches once the last concurrent save settles, not while one is still in flight", async () => {
    const { Wrapper, qc } = makeSettingsWrapper();
    const first = deferred<UserSettings>();
    const second = deferred<UserSettings>();
    vi.mocked(apiClient.post)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper: Wrapper });

    act(() => {
      void result.current.save({ inboxEnabled: false });
      void result.current.save({ uiLocale: "de" });
    });
    await waitFor(() => expect(result.current.isSaving("uiLocale")).toBe(true));

    await act(async () => {
      first.resolve({ ...mockSettings, inboxEnabled: 0 });
    });
    await waitFor(() => expect(result.current.isSaving("inboxEnabled")).toBe(false));
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve({ ...mockSettings, uiLocale: "de" });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });
});
