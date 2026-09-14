import {
  Alert,
  Badge,
  Button,
  Grid,
  Group,
  Select,
  Skeleton,
  TextInput,
  Title,
} from "@mantine/core";
import { useState, useEffect } from "react";

import { useSession } from "../api/authService";
import { APP_NAME } from "../lib/brand";
import { dbBoolean } from "../lib/dbBoolean";
import { useUserSettings, useUpdateUserSettings } from "../api/settingsService";
import { ProfileThemeSwatches } from "../components/customise/ProfileThemeSwatches";
import { SettingsSection } from "../components/customise/SettingsSection";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsToggle } from "../components/SettingsToggle";
import { uiLocaleOptions, useTranslations } from "../lib/i18n";
import { touchpointLocales } from "../lib/touchpointTranslations";
import { useNumberFormat } from "../lib/useNumberFormat";

import * as styles from "./Customise.styles";

const MAX_PROMPT_LENGTH = 100;
const CARD_SPAN = { base: 12, md: 6 };

export default function Customise() {
  const messages = useTranslations();
  const formatNumber = useNumberFormat();
  const { data: session, isLoading: sessionLoading } = useSession();
  const {
    data: userSettings,
    isLoading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useUserSettings();
  const updateSettings = useUpdateUserSettings();

  // Drafted locally so typing doesn't fire a mutation per keystroke; persisted
  // on blur, then resynced so the trimmed server value is what's shown.
  const [promptDraft, setPromptDraft] = useState<string>(userSettings?.customPrompt ?? "");
  const promptInSync = (userSettings?.customPrompt ?? "") === promptDraft;
  useEffect(() => {
    setPromptDraft(userSettings?.customPrompt ?? "");
  }, [userSettings?.customPrompt]);

  const saving = updateSettings.isSaving;

  const loadError = (
    <Alert color="red" title={messages.common.settingsLoadErrorTitle} withCloseButton={false}>
      <Button size="xs" onClick={() => refetchSettings()} variant="light" mt="xs">
        {messages.common.retry}
      </Button>
    </Alert>
  );

  /** Every bottom-anchored control shows the same three states. */
  const field = (skeletonHeight: number, control: React.ReactNode) => {
    if (settingsLoading) return <Skeleton height={skeletonHeight} radius="sm" />;
    if (settingsError) return loadError;
    return control;
  };

  /** Header switches shrink to a track-sized skeleton; the error goes in the body. */
  const headerToggle = (toggle: React.ReactNode) => {
    if (settingsLoading) return <Skeleton height={22} width={38} radius="xl" />;
    if (settingsError) return null;
    return toggle;
  };

  if (!session?.isLoggedIn && !sessionLoading) {
    return (
      <Alert title={messages.common.errorTitle} color="red">
        {messages.common.accessDeniedMessage}
      </Alert>
    );
  }

  return (
    <>
      <Group gap="sm" align="center" mb="xs">
        <Title order={1}>{messages.customisePage.heading}</Title>
        <Badge color="accent" variant="light" radius="sm">
          {messages.customisePage.beta}
        </Badge>
      </Group>

      <SettingsSection
        eyebrow={messages.customisePage.yourPublicProfile}
        help={messages.customisePage.yourPublicProfileHelp}
      >
        <Grid.Col span={CARD_SPAN} style={{ display: "flex" }}>
          <SettingsCard
            title={messages.customisePage.profilePrompt}
            description={messages.customisePage.profilePromptDescription}
          >
            {field(
              36,
              <TextInput
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
                onBlur={() => {
                  if (promptInSync) return;
                  updateSettings.save({ customPrompt: promptDraft.trim() || null });
                }}
                placeholder={messages.customisePage.profilePromptPlaceholder}
                maxLength={MAX_PROMPT_LENGTH}
                disabled={saving("customPrompt")}
                aria-label={messages.customisePage.profilePrompt}
                description={`${formatNumber(promptDraft.length)}/${formatNumber(MAX_PROMPT_LENGTH)}`}
                styles={styles.promptCounter}
              />
            )}
          </SettingsCard>
        </Grid.Col>

        <Grid.Col span={CARD_SPAN} style={{ display: "flex" }}>
          <SettingsCard
            title={messages.customisePage.profileCardColour}
            description={messages.customisePage.profileCardColourDescription}
          >
            {field(
              56,
              <ProfileThemeSwatches
                value={userSettings?.profileCardTheme ?? null}
                disabled={saving("profileCardTheme")}
                onPick={(value) => updateSettings.save({ profileCardTheme: value })}
              />
            )}
          </SettingsCard>
        </Grid.Col>
      </SettingsSection>

      <SettingsSection
        eyebrow={messages.customisePage.languages}
        help={messages.customisePage.languagesHelp}
      >
        <Grid.Col span={CARD_SPAN} style={{ display: "flex" }}>
          <SettingsCard
            title={messages.customisePage.appLanguage}
            description={messages.customisePage.appLanguageDescription}
          >
            {field(
              36,
              <Select
                data={uiLocaleOptions}
                value={
                  uiLocaleOptions.some((l) => l.value === userSettings?.uiLocale)
                    ? userSettings!.uiLocale!
                    : "en"
                }
                onChange={(value) => {
                  // allowDeselect={false} — Mantine never emits null/"" here.
                  /* istanbul ignore next */
                  updateSettings.save({ uiLocale: value || null });
                }}
                disabled={saving("uiLocale")}
                allowDeselect={false}
                aria-label={messages.customisePage.appLanguage}
              />
            )}
          </SettingsCard>
        </Grid.Col>

        <Grid.Col span={CARD_SPAN} style={{ display: "flex" }}>
          <SettingsCard
            title={messages.customisePage.messageLanguage}
            description={messages.customisePage.messageLanguageDescription}
          >
            {field(
              36,
              <Select
                data={touchpointLocales}
                value={
                  touchpointLocales.some((l) => l.value === userSettings?.touchpointLocale)
                    ? userSettings!.touchpointLocale!
                    : "en"
                }
                onChange={(value) => {
                  // allowDeselect={false} — Mantine never emits null/"" here.
                  /* istanbul ignore next */
                  updateSettings.save({ touchpointLocale: value || null });
                }}
                disabled={saving("touchpointLocale")}
                allowDeselect={false}
                aria-label={messages.customisePage.messageLanguage}
              />
            )}
          </SettingsCard>
        </Grid.Col>
      </SettingsSection>

      <SettingsSection
        eyebrow={messages.customisePage.messageIntake}
        help={messages.customisePage.messageIntakeHelp}
      >
        <Grid.Col span={CARD_SPAN} style={{ display: "flex" }}>
          <SettingsCard
            title={messages.customisePage.inbox}
            description={messages.customisePage.inboxDescription}
            control={headerToggle(
              <SettingsToggle
                label={messages.customisePage.inbox}
                checked={dbBoolean(userSettings?.inboxEnabled, false)}
                onChange={(checked) => updateSettings.save({ inboxEnabled: checked })}
                saving={saving("inboxEnabled")}
              />
            )}
          >
            {settingsError ? loadError : null}
          </SettingsCard>
        </Grid.Col>

        <Grid.Col span={CARD_SPAN} style={{ display: "flex" }}>
          <SettingsCard
            title={messages.customisePage.profanityFilter}
            description={messages.customisePage.profanityFilterDescription}
            control={headerToggle(
              <SettingsToggle
                label={messages.customisePage.profanityFilter}
                checked={dbBoolean(userSettings?.profanityFilterEnabled, false)}
                onChange={(checked) => updateSettings.save({ profanityFilterEnabled: checked })}
                saving={saving("profanityFilterEnabled")}
              />
            )}
          >
            {settingsError ? loadError : null}
          </SettingsCard>
        </Grid.Col>
      </SettingsSection>

      <SettingsSection
        eyebrow={messages.customisePage.atmosphereLinks}
        help={messages.customisePage.atmosphereLinksHelp}
        last
      >
        <Grid.Col span={CARD_SPAN} style={{ display: "flex" }}>
          <SettingsCard
            title={messages.customisePage.atmosphereLinksSetting}
            description={messages.customisePage.atmosphereLinksSettingDescription}
            control={headerToggle(
              <SettingsToggle
                label={messages.customisePage.atmosphereLinksSetting}
                checked={dbBoolean(userSettings?.atmosphereLinksEnabled, true)}
                onChange={(checked) => updateSettings.save({ atmosphereLinksEnabled: checked })}
                saving={saving("atmosphereLinksEnabled")}
              />
            )}
          >
            {settingsError ? loadError : null}
          </SettingsCard>
        </Grid.Col>

        <Grid.Col span={CARD_SPAN} style={{ display: "flex" }}>
          <SettingsCard
            title={messages.customisePage.openProfilesInApp(APP_NAME)}
            description={messages.customisePage.openProfilesInAppDescription(APP_NAME)}
            control={headerToggle(
              <SettingsToggle
                label={messages.customisePage.openProfilesInApp(APP_NAME)}
                checked={dbBoolean(userSettings?.openProfilesInApp, true)}
                onChange={(checked) => updateSettings.save({ openProfilesInApp: checked })}
                saving={saving("openProfilesInApp")}
              />
            )}
          >
            {settingsError ? loadError : null}
          </SettingsCard>
        </Grid.Col>
      </SettingsSection>
    </>
  );
}
