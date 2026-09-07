import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { apiClient, ApiError } from "./apiClient";

export interface AskCardCustomisation {
  customPrompt: string | null;
  profileCardTheme: string | null;
  touchpointLocale: string | null;
}

export interface UserSettings extends AskCardCustomisation {
  did: string;
  pdsSyncEnabled: number | boolean;
  imageTheme: string;
  inboxEnabled: number | boolean;
  profanityFilterEnabled: number | boolean;
  uiLocale: string | null;
  defaultClient: string | null;
  openProfilesInApp: number | boolean;
  atmosphereLinksEnabled: number | boolean;
  createdAt: string;
}

export interface UserStats {
  messageCount: number;
  memberSince: string | null;
}

export interface PdsInfo {
  pdsUrl: string | null;
  recordCount: number;
}

export const settingsKeys = {
  all: ["settings"] as const,
  user: () => [...settingsKeys.all, "user"] as const,
  stats: () => [...settingsKeys.all, "stats"] as const,
  pdsInfo: () => [...settingsKeys.all, "pds-info"] as const,
  update: () => [...settingsKeys.all, "update"] as const,
};

/** The fields one save carries. Every request updates only the keys it names. */
export type SettingsPatch = Partial<UserSettings>;

export type SettingsField = keyof UserSettings;

export const settingsService = {
  getUserSettings: async (): Promise<UserSettings> => {
    return apiClient.get<UserSettings>("/settings");
  },

  updateUserSettings: async (settings: Partial<UserSettings>): Promise<UserSettings> => {
    return apiClient.post<UserSettings, Partial<UserSettings>>("/settings", settings);
  },

  getStats: async (): Promise<UserStats> => {
    return apiClient.get<UserStats>("/stats");
  },

  getPdsInfo: async (): Promise<PdsInfo> => {
    return apiClient.get<PdsInfo>("/pds-info");
  },
};

export function useUserSettings() {
  return useQuery<UserSettings, ApiError>({
    queryKey: settingsKeys.user(),
    queryFn: () => settingsService.getUserSettings(),
    retry: (failureCount, error) => {
      if (error.status === 404 || error.status === 401 || error.status === 403) {
        return false;
      }
      return failureCount < 3;
    },
    refetchOnWindowFocus: false,
    // Every mutation invalidates settingsKeys.all, so a background refetch
    // between user actions would only duplicate work.
    staleTime: Infinity,
  });
}

export function useUserStats() {
  return useQuery<UserStats, ApiError>({
    queryKey: settingsKeys.stats(),
    queryFn: () => settingsService.getStats(),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function usePdsInfo() {
  return useQuery<PdsInfo, ApiError>({
    queryKey: settingsKeys.pdsInfo(),
    queryFn: () => settingsService.getPdsInfo(),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/** The keys of `shape`, read off `source`. */
function project(source: UserSettings, shape: SettingsPatch): SettingsPatch {
  return Object.fromEntries(
    Object.keys(shape).map((key) => [key, source[key as SettingsField]])
  ) as SettingsPatch;
}

function mergeIntoCache(client: QueryClient, patch: SettingsPatch) {
  client.setQueryData<UserSettings>(settingsKeys.user(), (cached) =>
    cached ? { ...cached, ...patch } : cached
  );
}

interface SaveContext {
  /** This save's own fields as they stood before it started, for rollback. */
  previous?: SettingsPatch;
}

/**
 * `onSettled` runs before the mutation leaves the pending set, so a count of one
 * means this save is the last one standing.
 *
 * @see [settingsService.test.ts](../tests/settingsService.test.ts) — "refetches
 * once the last concurrent save settles, not while one is still in flight".
 */
const ONLY_THIS_SAVE = 1;

export interface UpdateUserSettings {
  /** Persists one patch. Resolves with the saved row, or `null` if it failed. */
  save: (patch: SettingsPatch) => Promise<UserSettings | null>;
  /** True only while a request carrying this field is in flight. */
  isSaving: (field: SettingsField) => boolean;
  isSavingAny: boolean;
}

/**
 * Saves settings one patch at a time, without any of them waiting on the others.
 * Each call is its own request, applied to the cache optimistically and rolled
 * back field-by-field on failure, so a slow save never blocks or reverts a
 * sibling. Callers ask `isSaving(field)` rather than reading one shared pending
 * flag.
 *
 * @see [settingsService.test.ts](../tests/settingsService.test.ts) — "leaves a
 * second field free while the first is in flight".
 * @see [customise.spec.ts](../../../e2e/web/customise.spec.ts) — "two switches
 * flipped back to back both land" pins the same rule end to end.
 */
export function useUpdateUserSettings(options?: {
  onSuccess?: () => void;
  onError?: (error: ApiError) => void;
}): UpdateUserSettings {
  const client = useQueryClient();

  const mutation = useMutation<UserSettings, ApiError, SettingsPatch, SaveContext>({
    mutationKey: settingsKeys.update(),
    mutationFn: (patch) => settingsService.updateUserSettings(patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: settingsKeys.user() });
      const cached = client.getQueryData<UserSettings>(settingsKeys.user());
      mergeIntoCache(client, patch);
      return { previous: cached && project(cached, patch) };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) mergeIntoCache(client, context.previous);
      options?.onError?.(error);
    },
    onSuccess: (saved, patch) => {
      mergeIntoCache(client, project(saved, patch));
      options?.onSuccess?.();
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: settingsKeys.update() }) === ONLY_THIS_SAVE) {
        client.invalidateQueries({ queryKey: settingsKeys.all });
      }
    },
  });

  const inFlight = useMutationState<SettingsPatch>({
    filters: { mutationKey: settingsKeys.update(), status: "pending" },
    // A pending mutation always carries its variables, so there is nothing to guard.
    select: (saving) => saving.state.variables as SettingsPatch,
  });

  return {
    // The hook-level onError has already surfaced the failure, so the promise
    // resolves rather than rejecting into every un-awaited call site.
    save: (patch) => mutation.mutateAsync(patch).catch(() => null),
    isSaving: (field) => inFlight.some((patch) => field in patch),
    isSavingAny: inFlight.length > 0,
  };
}
