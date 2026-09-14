import type { Messages } from "./i18n/types";

export const imageThemeIds = ["default", "compressed", "twitter"] as const;
export type ImageThemeId = (typeof imageThemeIds)[number];

export function imageThemeLabels(messages: Messages): Record<ImageThemeId, string> {
  return messages.themes.image;
}

/**
 * Fill tokens rather than arbitrary hexes, so the send button and headline
 * stay legible on every option. The keys are persisted in
 * `user_settings.profileCardTheme` and predate the redesign, so they cannot
 * follow the labels: `royal` is ink, `aurora` steel, `ember` midnight and
 * `verdant` paper.
 *
 * @see [themes.test.ts](../tests/lib/themes.test.ts) — pins the fallback and
 * the paper preset.
 */
export interface ProfileCardFill {
  background: string;
  /** The one light fill; every other fill carries the on-fill white. */
  paper: boolean;
}

export interface ProfileCardTheme extends ProfileCardFill {
  label: string;
}

const PROFILE_CARD_FILLS: Record<string, ProfileCardFill> = {
  royal: { background: "var(--ds-fill-ink)", paper: false },
  aurora: { background: "var(--ds-fill-steel)", paper: false },
  ember: { background: "var(--ds-fill-midnight)", paper: false },
  verdant: { background: "var(--ds-fill-paper)", paper: true },
};

export const DEFAULT_PROFILE_CARD_THEME = "royal";

export function profileCardThemes(messages: Messages): Record<string, ProfileCardTheme> {
  return Object.fromEntries(
    Object.entries(PROFILE_CARD_FILLS).map(([id, fill]) => [
      id,
      {
        label: messages.themes.profileCard[id as keyof Messages["themes"]["profileCard"]],
        ...fill,
      },
    ])
  );
}

export function profileCardFill(theme: string | null | undefined): ProfileCardFill {
  return (theme && PROFILE_CARD_FILLS[theme]) || PROFILE_CARD_FILLS[DEFAULT_PROFILE_CARD_THEME];
}
