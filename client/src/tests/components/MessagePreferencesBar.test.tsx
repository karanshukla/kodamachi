import { useMediaQuery } from "@mantine/hooks";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessagePreferencesBar } from "../../components/messages/MessagePreferencesBar";
import { en } from "../../lib/i18n/en";
import {
  PREFERENCE_KEYS,
  type MessagePreferences,
  type MessagePreferencesState,
} from "../../lib/useMessagePreferences";
import { renderWithProviders } from "../testUtils";

vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return { ...actual, useMediaQuery: vi.fn() };
});

const mockUseMediaQuery = vi.mocked(useMediaQuery);

const DEFAULTS: MessagePreferences = {
  appendProfileLink: false,
  useGradients: true,
  includeQuestionAsImage: true,
  confirmBeforeDelete: false,
  autoScrollToMessages: true,
};

interface Options {
  preferences?: Partial<MessagePreferences>;
  imageTheme?: string | null;
  imageThemeDisabled?: boolean;
}

function renderBar({ preferences, imageTheme = null, imageThemeDisabled = false }: Options = {}) {
  const setPreference = vi.fn();
  const onSelectImageTheme = vi.fn();
  const merged = { ...DEFAULTS, ...preferences };
  const state: MessagePreferencesState = {
    preferences: merged,
    setPreference,
    enabledCount: PREFERENCE_KEYS.filter((key) => merged[key]).length,
  };

  renderWithProviders(
    <MessagePreferencesBar
      state={state}
      imageTheme={imageTheme}
      imageThemeDisabled={imageThemeDisabled}
      onSelectImageTheme={onSelectImageTheme}
    />
  );

  return { setPreference, onSelectImageTheme };
}

const chip = (name: string) => screen.getByRole("button", { name });
const themeHalf = () => screen.getByRole("button", { name: new RegExp(en.imageThemePicker.title) });
const openPanel = () => fireEvent.click(chip(en.preferencesBar.open));
/** On a phone the button names what it opens, since there are no chips beside it. */
const openSheet = () => fireEvent.click(chip(en.postingPreferences.title));

/** Popovers and drawers stay mounted through their exit transition. */
const expectGone = (text: string) => waitFor(() => expect(screen.queryByText(text)).toBeNull());

describe("MessagePreferencesBar", () => {
  beforeEach(() => {
    mockUseMediaQuery.mockReturnValue(false);
  });

  it("turns the inbox link on when its chip is pressed", () => {
    const { setPreference } = renderBar();

    fireEvent.click(chip(en.postingPreferences.appendProfileLink.shortLabel));

    expect(setPreference).toHaveBeenCalledWith("appendProfileLink", true);
  });

  it("turns the question image off from the chip's toggle half", () => {
    const { setPreference } = renderBar();

    fireEvent.click(chip(en.postingPreferences.includeQuestionAsImage.shortLabel));

    expect(setPreference).toHaveBeenCalledWith("includeQuestionAsImage", false);
  });

  // The three that repaint the page or guard a click are panel-only, so the row
  // carries one meaning: what goes into the post.
  it("keeps the preferences that do not change the post off the bar", () => {
    renderBar();

    expect(
      screen.queryByRole("button", { name: en.postingPreferences.useGradients.label })
    ).toBeNull();
  });

  it("names the default theme on the chip until settings load", () => {
    renderBar();

    expect(themeHalf()).toHaveTextContent(en.themes.image.default);
  });

  it("names the saved theme on the chip once settings load", () => {
    renderBar({ imageTheme: "twitter" });

    expect(themeHalf()).toHaveTextContent(en.themes.image.twitter);
  });

  it("disables the theme half while the question image is off", () => {
    renderBar({ preferences: { includeQuestionAsImage: false } });

    expect(themeHalf()).toBeDisabled();
  });

  it("saves the picked theme and closes the picker", async () => {
    const { onSelectImageTheme } = renderBar();
    fireEvent.click(themeHalf());

    fireEvent.click(await screen.findByRole("button", { name: en.themes.image.compressed }));

    expect(onSelectImageTheme).toHaveBeenCalledWith("compressed");
    await expectGone(en.themes.image.compressed);
  });

  it("closes the panel when the button is pressed a second time", async () => {
    renderBar();

    openPanel();
    expect(
      await screen.findByText(en.postingPreferences.useGradients.description)
    ).toBeInTheDocument();

    openPanel();
    await expectGone(en.postingPreferences.useGradients.description);
  });

  it("keeps the keyboard shortcuts behind a disclosure in the panel", async () => {
    renderBar();

    openPanel();
    const disclosure = await screen.findByRole("button", { name: en.common.shortcuts.title });
    expect(screen.queryByText(en.common.shortcuts.focusCycleCards)).toBeNull();

    fireEvent.click(disclosure);

    expect(await screen.findByText(en.common.shortcuts.focusCycleCards)).toBeInTheDocument();
  });

  // A bar whose chips are hidden is an empty box, so the phone gets the button alone.
  it("drops the chips entirely on a small viewport", () => {
    mockUseMediaQuery.mockReturnValue(true);
    renderBar();

    expect(
      screen.queryByRole("button", { name: en.postingPreferences.appendProfileLink.shortLabel })
    ).toBeNull();
  });

  it("opens the preferences as a sheet on a small viewport", async () => {
    mockUseMediaQuery.mockReturnValue(true);
    renderBar();

    openSheet();

    expect(
      await screen.findByText(en.postingPreferences.useGradients.description)
    ).toBeInTheDocument();
  });

  // The chips are hidden on a phone, so the sheet is the only way to the theme.
  it("carries the image theme in the sheet", async () => {
    mockUseMediaQuery.mockReturnValue(true);
    const { onSelectImageTheme } = renderBar();

    openSheet();
    fireEvent.click(await screen.findByRole("button", { name: en.themes.image.compressed }));

    expect(onSelectImageTheme).toHaveBeenCalledWith("compressed");
  });

  // A phone can have a keyboard attached; the two surfaces carry the same list.
  it("carries the keyboard shortcuts in the sheet too", async () => {
    mockUseMediaQuery.mockReturnValue(true);
    renderBar();

    openSheet();
    fireEvent.click(await screen.findByRole("button", { name: en.common.shortcuts.title }));

    expect(await screen.findByText(en.common.shortcuts.focusCycleCards)).toBeInTheDocument();
  });

  it("closes the sheet from its own close button", async () => {
    mockUseMediaQuery.mockReturnValue(true);
    renderBar();

    openSheet();
    await screen.findByText(en.postingPreferences.useGradients.description);

    fireEvent.click(chip(en.common.close));

    await expectGone(en.postingPreferences.useGradients.description);
  });

  it("switches a preference from inside the panel", async () => {
    const { setPreference } = renderBar();
    openPanel();

    fireEvent.click(
      await screen.findByRole("switch", { name: en.postingPreferences.confirmBeforeDelete.label })
    );

    expect(setPreference).toHaveBeenCalledWith("confirmBeforeDelete", true);
  });
});
