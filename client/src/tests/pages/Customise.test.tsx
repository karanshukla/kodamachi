import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import * as authService from "../../api/authService";
import * as settingsService from "../../api/settingsService";
import { APP_NAME } from "../../lib/brand";
import { uiLocaleOptions } from "../../lib/i18n";
import { en } from "../../lib/i18n/en";
import { touchpointLocales } from "../../lib/touchpointTranslations";
import Customise from "../../pages/Customise";
import { renderWithProviders } from "../testUtils";

vi.mock("../../api/authService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/authService")>();
  return { ...actual, useSession: vi.fn() };
});

vi.mock("../../api/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/settingsService")>();
  return {
    ...actual,
    useUserSettings: vi.fn(),
    useUpdateUserSettings: vi.fn(),
  };
});

const mockUseSession = vi.mocked(authService.useSession);
const mockUseUserSettings = vi.mocked(settingsService.useUserSettings);
const mockUseUpdateUserSettings = vi.mocked(settingsService.useUpdateUserSettings);

function mockSettings(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      did: "did:example:user",
      pdsSyncEnabled: 1,
      imageTheme: "default",
      inboxEnabled: 1,
      profanityFilterEnabled: 0,
      customPrompt: null,
      profileCardTheme: null,
      touchpointLocale: null,
      uiLocale: null,
      defaultClient: null,
      openProfilesInApp: 1,
      atmosphereLinksEnabled: 1,
      createdAt: "2025-01-01T00:00:00.000Z",
      ...overrides,
    },
    isLoading: false,
  } as any;
}

/** Returns the `save` spy. `savingField`, if given, is the only field in flight. */
function mockMutation(savingField?: string) {
  const save = vi.fn();
  mockUseUpdateUserSettings.mockReturnValue({
    save,
    isSaving: (field: string) => field === savingField,
    isSavingAny: savingField !== undefined,
  } as any);
  return save;
}

describe("Customise page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: { isLoggedIn: true, profile: { handle: "karan.bsky.social" } },
      isLoading: false,
    } as any);
    // Default the settings hook so the component doesn't throw on render even
    // in the logged-out test (useUserSettings is called before the auth gate).
    mockUseUserSettings.mockReturnValue(mockSettings());
    mockMutation();
  });

  it("shows auth error when user is not logged in", () => {
    mockUseSession.mockReturnValue({
      data: { isLoggedIn: false },
      isLoading: false,
    } as any);
    renderWithProviders(<Customise />);
    expect(screen.getByText(en.common.accessDeniedMessage)).toBeInTheDocument();
  });

  it("renders the grouped sections and wired controls for a logged-in user", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    mockMutation();
    renderWithProviders(<Customise />);

    expect(screen.getByRole("heading", { name: en.customisePage.heading })).toBeInTheDocument();
    // Section eyebrows
    expect(screen.getByText(en.customisePage.yourPublicProfile)).toBeInTheDocument();
    expect(screen.getByText(en.customisePage.languages)).toBeInTheDocument();
    expect(screen.getByText(en.customisePage.messageIntake)).toBeInTheDocument();
    // Wired cards
    expect(screen.getByText(en.customisePage.profilePrompt)).toBeInTheDocument();
    expect(screen.getByText(en.customisePage.appLanguage)).toBeInTheDocument();
    expect(screen.getByText(en.customisePage.messageLanguage)).toBeInTheDocument();
    expect(screen.getByText(en.customisePage.profileCardColour)).toBeInTheDocument();
    expect(screen.getByText(en.customisePage.inbox)).toBeInTheDocument();
    expect(screen.getByText(en.customisePage.profanityFilter)).toBeInTheDocument();
    // Notifications section was removed.
    expect(screen.queryByText(/^notifications$/i)).toBeNull();
    expect(screen.queryByText(/what sends a push/i)).toBeNull();
  });

  it("toggling the profile switch saves with only openProfilesInApp", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    const save = mockMutation();
    renderWithProviders(<Customise />);

    fireEvent.click(
      screen.getByRole("switch", { name: en.customisePage.openProfilesInApp(APP_NAME) })
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ openProfilesInApp: false });
  });

  it("toggling the Atmosphere links switch saves with only that key", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    const save = mockMutation();
    renderWithProviders(<Customise />);

    fireEvent.click(screen.getByRole("switch", { name: en.customisePage.atmosphereLinksSetting }));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ atmosphereLinksEnabled: false });
  });

  it("shows the Atmosphere links switch on for an account with no settings row", () => {
    // Migration 014 backfills 1, so an account that never opened /customise is
    // opted in and the switch has to say so.
    mockUseUserSettings.mockReturnValue({ data: undefined, isLoading: false } as any);
    mockMutation();
    renderWithProviders(<Customise />);

    expect(
      screen.getByRole("switch", { name: en.customisePage.atmosphereLinksSetting })
    ).toBeChecked();
  });

  it("toggling the inbox switch saves with only inboxEnabled", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    const save = mockMutation();
    renderWithProviders(<Customise />);

    const toggle = screen.getByRole("switch", { name: en.customisePage.inbox });
    fireEvent.click(toggle);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ inboxEnabled: false });
  });

  it("toggling the profanity filter saves with only profanityFilterEnabled", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    const save = mockMutation();
    renderWithProviders(<Customise />);

    const toggle = screen.getByRole("switch", { name: en.customisePage.profanityFilter });
    fireEvent.click(toggle);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ profanityFilterEnabled: true });
  });

  it.each(touchpointLocales.filter((l) => l.value !== "en"))(
    "picking $value saves with touchpointLocale",
    ({ value, label }) => {
      mockUseUserSettings.mockReturnValue(mockSettings());
      const save = mockMutation();
      renderWithProviders(<Customise />);

      // Mantine Select renders a combobox. Query by role to avoid matching
      // the card title text, then open it and pick the target language.
      const combobox = screen.getByRole("combobox", { name: en.customisePage.messageLanguage });
      fireEvent.click(combobox);
      const option = screen.getByRole("option", { name: label });
      fireEvent.click(option);

      expect(save).toHaveBeenCalledWith({ touchpointLocale: value });
    }
  );

  it.each(uiLocaleOptions.filter((l) => l.value !== "en"))(
    "picking $value saves with uiLocale",
    ({ value, label }) => {
      mockUseUserSettings.mockReturnValue(mockSettings());
      const save = mockMutation();
      renderWithProviders(<Customise />);

      const combobox = screen.getByRole("combobox", { name: en.customisePage.appLanguage });
      fireEvent.click(combobox);
      const option = screen.getByRole("option", { name: label });
      fireEvent.click(option);

      expect(save).toHaveBeenCalledWith({ uiLocale: value });
    }
  );

  it.each(touchpointLocales.filter((l) => l.value !== "en"))(
    "shows the matching label when touchpointLocale is already set to $value",
    ({ value, label }) => {
      mockUseUserSettings.mockReturnValue(mockSettings({ touchpointLocale: value }));
      mockMutation();
      renderWithProviders(<Customise />);

      expect(screen.getByRole("combobox", { name: en.customisePage.messageLanguage })).toHaveValue(
        label
      );
    }
  );

  it("shows English as the App language selector's default value", () => {
    mockUseUserSettings.mockReturnValue(mockSettings({ uiLocale: null }));
    mockMutation();
    renderWithProviders(<Customise />);

    expect(screen.getByRole("combobox", { name: en.customisePage.appLanguage })).toHaveValue(
      "English"
    );
  });

  it("shows the matching label when uiLocale is already set to a known locale", () => {
    mockUseUserSettings.mockReturnValue(mockSettings({ uiLocale: "en" }));
    mockMutation();
    renderWithProviders(<Customise />);

    expect(screen.getByRole("combobox", { name: en.customisePage.appLanguage })).toHaveValue(
      "English"
    );
  });

  it("shows English for the App language selector when uiLocale is an unsupported value", () => {
    mockUseUserSettings.mockReturnValue(mockSettings({ uiLocale: "it" }));
    mockMutation();
    renderWithProviders(<Customise />);

    expect(screen.getByRole("combobox", { name: en.customisePage.appLanguage })).toHaveValue(
      "English"
    );
  });

  it.each(uiLocaleOptions.filter((l) => l.value !== "en"))(
    "shows the matching label when uiLocale is set to $value",
    ({ value, label }) => {
      mockUseUserSettings.mockReturnValue(mockSettings({ uiLocale: value }));
      mockMutation();
      renderWithProviders(<Customise />);

      expect(screen.getByRole("combobox", { name: en.customisePage.appLanguage })).toHaveValue(
        label
      );
    }
  );

  it("disables the App language selector while its own update is in flight", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    mockMutation("uiLocale");
    renderWithProviders(<Customise />);

    expect(screen.getByRole("combobox", { name: en.customisePage.appLanguage })).toBeDisabled();
  });

  it("leaves every other control usable while one save is in flight", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    const save = mockMutation("uiLocale");
    renderWithProviders(<Customise />);

    expect(
      screen.getByRole("combobox", { name: en.customisePage.messageLanguage })
    ).not.toBeDisabled();
    expect(screen.getByLabelText(en.customisePage.profilePrompt)).not.toBeDisabled();
    expect(screen.getByRole("button", { name: en.themes.profileCard.ember })).not.toBeDisabled();

    const inbox = screen.getByRole("switch", { name: en.customisePage.inbox });
    expect(inbox).not.toBeDisabled();
    fireEvent.click(inbox);
    expect(save).toHaveBeenCalledWith({ inboxEnabled: false });
  });

  it("picking a profile card theme swatch saves with profileCardTheme", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    const save = mockMutation();
    renderWithProviders(<Customise />);

    fireEvent.click(screen.getByRole("button", { name: en.themes.profileCard.ember }));
    expect(save).toHaveBeenCalledWith({ profileCardTheme: "ember" });
  });

  it("persisting a custom prompt saves with the trimmed value", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    const save = mockMutation();
    renderWithProviders(<Customise />);

    const input = screen.getByLabelText(en.customisePage.profilePrompt) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Ask me anything" } });
    fireEvent.blur(input);

    expect(save).toHaveBeenCalledWith({ customPrompt: "Ask me anything" });
  });

  it("blurring an unchanged prompt does not fire a mutation", () => {
    mockUseUserSettings.mockReturnValue(mockSettings({ customPrompt: "existing" }));
    const save = mockMutation();
    renderWithProviders(<Customise />);

    const input = screen.getByLabelText(en.customisePage.profilePrompt) as HTMLInputElement;
    fireEvent.blur(input); // no change

    expect(save).not.toHaveBeenCalled();
  });

  it("clearing the prompt persists null (revert to default)", () => {
    mockUseUserSettings.mockReturnValue(mockSettings({ customPrompt: "existing" }));
    const save = mockMutation();
    renderWithProviders(<Customise />);

    const input = screen.getByLabelText(en.customisePage.profilePrompt) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(save).toHaveBeenCalledWith({ customPrompt: null });
  });

  it("shows skeletons in every card while settings are loading", () => {
    mockUseUserSettings.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);
    mockMutation();
    renderWithProviders(<Customise />);

    expect(screen.getByRole("heading", { name: en.customisePage.heading })).toBeInTheDocument();
    expect(screen.queryByLabelText(en.customisePage.profilePrompt)).toBeNull();
    expect(screen.queryByLabelText(en.customisePage.appLanguage)).toBeNull();
    expect(screen.queryByLabelText(en.customisePage.messageLanguage)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("disables only the control whose own save is in flight", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    mockMutation("profileCardTheme");
    renderWithProviders(<Customise />);

    expect(screen.getByRole("button", { name: en.themes.profileCard.ember })).toBeDisabled();
    expect(screen.getByRole("switch", { name: en.customisePage.inbox })).not.toBeDisabled();
  });

  it("spins only the switch whose field is in flight", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    mockMutation("inboxEnabled");
    const { container } = renderWithProviders(<Customise />);

    // One thumb spinner on the page — the inbox switch, not the filter switch.
    expect(container.querySelectorAll(".mantine-Loader-root")).toHaveLength(1);
  });

  it("renders correctly in dark mode", () => {
    mockUseUserSettings.mockReturnValue(mockSettings());
    mockMutation();
    renderWithProviders(<Customise />, { colorScheme: "dark" });
    expect(screen.getByRole("heading", { name: en.customisePage.heading })).toBeInTheDocument();
  });

  it("shows a retry control when settings fail to load", () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockUseUserSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch,
    } as any);
    mockMutation();
    renderWithProviders(<Customise />);

    // The settings-error fallback renders inside each card, so there's a
    // retry button per card. Clicking any of them calls refetchSettings.
    const retry = screen.getAllByRole("button", { name: en.common.retry })[0];
    fireEvent.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
