import {
  Box,
  Button,
  Drawer,
  Paper,
  Popover,
  Text,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAdjustmentsHorizontal, IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import { useHaptic } from "use-haptic";

import { useTranslations } from "../../lib/i18n";
import { imageThemeLabels, type ImageThemeId } from "../../lib/themes";
import type { MessagePreferencesState, PreferenceKey } from "../../lib/useMessagePreferences";
import { ShortcutList } from "../ShortcutList";

import { ImageThemeSwatches } from "./ImageThemeSwatches";
import * as styles from "./MessagePreferencesBar.styles";
import { PreferenceRows } from "./PreferenceRows";

/**
 * Below this there is no bar at all, just the button that opens the sheet: two
 * labelled chips plus the theme name overflow a phone, and a bar with its
 * contents hidden is an empty box. Everything the chips reach is in the sheet.
 */
const COMPACT_VIEWPORT = "(max-width: 61.99em)"; /* i18n-allow: media query */

/** Read on the first render, so a phone never flashes the desktop bar. */
const COMPACT_ON_FIRST_RENDER = { getInitialValueInEffect: false };

const PANEL_WIDTH = 440;
const THEME_PANEL_WIDTH = 330;
const SHEET_BUTTON_HEIGHT = 44;
const DEFAULT_THEME: ImageThemeId = "default";

const TOOLTIP_WIDTH = 240;
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };

interface MessagePreferencesBarProps {
  state: MessagePreferencesState;
  /** Null until settings load, so the default is shown rather than nothing. */
  imageTheme: string | null;
  imageThemeDisabled: boolean;
  onSelectImageTheme: (theme: string) => void;
}

/**
 * The two preferences that change the post being published, as chips, plus a
 * way into everything else. Only these two belong on the bar: the other three
 * repaint the page or guard a click, and a row mixing all five carries no one
 * meaning a reader can take from it.
 */
export function MessagePreferencesBar({
  state,
  imageTheme,
  imageThemeDisabled,
  onSelectImageTheme,
}: MessagePreferencesBarProps) {
  const messages = useTranslations();
  const { triggerHaptic } = useHaptic(1);
  const compact = useMediaQuery(COMPACT_VIEWPORT, false, COMPACT_ON_FIRST_RENDER);
  const [panelOpened, setPanelOpened] = useState(false);
  const [themeOpened, setThemeOpened] = useState(false);

  const copy = messages.postingPreferences;
  const linkOn = state.preferences.appendProfileLink;
  const imageOn = state.preferences.includeQuestionAsImage;
  const activeTheme = (imageTheme ?? DEFAULT_THEME) as ImageThemeId;
  const themeLabels = imageThemeLabels(messages);
  const themeDisabled = imageThemeDisabled || !imageOn;
  const shortcuts = [
    { label: messages.common.shortcuts.focusCycleCards, hint: "Alt+R" /* i18n-allow */ },
    { label: messages.common.shortcuts.navigateCards, hint: "↑ / ↓" /* i18n-allow */ },
    { label: messages.common.shortcuts.closeExpandedCard, hint: "Esc" /* i18n-allow */ },
  ];

  const toggle = (key: PreferenceKey, on: boolean) => {
    triggerHaptic();
    state.setPreference(key, !on);
  };

  const togglePanel = () => {
    triggerHaptic();
    setPanelOpened((opened) => !opened);
  };

  const mark = (on: boolean) => (
    <span style={styles.chipMark(on)} aria-hidden>
      {on && <IconCheck size={13} stroke={2.6} />}
    </span>
  );

  const themeSwatches = (
    <ImageThemeSwatches
      selected={activeTheme}
      disabled={themeDisabled}
      onSelect={(theme) => {
        onSelectImageTheme(theme);
        setThemeOpened(false);
      }}
    />
  );

  const panelBody = (
    <>
      <PreferenceRows state={state} />
      <Box mt="md" pt="md" style={styles.panelSection}>
        <Text fw={600} fz={14} mb="sm">
          {messages.imageThemePicker.title}
        </Text>
        {themeSwatches}
      </Box>
      <Box mt="md" pt="md" style={styles.panelSection}>
        <ShortcutList title={messages.common.shortcuts.title} shortcuts={shortcuts} collapsible />
      </Box>
    </>
  );

  /* No chips to be "more" than on a phone, so the button names what it opens. */
  if (compact) {
    return (
      <>
        <Button
          fullWidth
          variant="default"
          radius="md"
          h={SHEET_BUTTON_HEIGHT}
          aria-expanded={panelOpened}
          leftSection={<IconAdjustmentsHorizontal size={18} />}
          onClick={togglePanel}
        >
          {copy.title}
        </Button>
        <Drawer
          opened={panelOpened}
          onClose={() => setPanelOpened(false)}
          position="bottom"
          styles={styles.sheet}
          title={copy.title}
          closeButtonProps={{ "aria-label": messages.common.close }}
        >
          {panelBody}
        </Drawer>
      </>
    );
  }

  return (
    <Paper style={styles.bar}>
      <Box style={styles.chips}>
        <Tooltip
          label={copy.appendProfileLink.description}
          multiline
          w={TOOLTIP_WIDTH}
          withArrow
          events={TOOLTIP_EVENTS}
        >
          <UnstyledButton
            aria-pressed={linkOn}
            style={styles.chip(linkOn)}
            onClick={() => toggle("appendProfileLink", linkOn)}
          >
            {mark(linkOn)}
            {copy.appendProfileLink.shortLabel}
          </UnstyledButton>
        </Tooltip>

        <Box style={styles.splitChip(imageOn)}>
          <Tooltip
            label={copy.includeQuestionAsImage.description}
            multiline
            w={TOOLTIP_WIDTH}
            withArrow
            events={TOOLTIP_EVENTS}
          >
            <UnstyledButton
              aria-pressed={imageOn}
              style={styles.splitChipToggle}
              onClick={() => toggle("includeQuestionAsImage", imageOn)}
            >
              {mark(imageOn)}
              {copy.includeQuestionAsImage.shortLabel}
            </UnstyledButton>
          </Tooltip>

          <span style={styles.splitChipRule(imageOn)} aria-hidden />

          <Popover
            opened={themeOpened}
            onChange={setThemeOpened}
            position="bottom-end"
            width={THEME_PANEL_WIDTH}
            radius="md"
            shadow="md"
            withinPortal
          >
            <Popover.Target>
              <UnstyledButton
                aria-expanded={themeOpened}
                disabled={themeDisabled}
                style={styles.splitChipTheme(!themeDisabled)}
                onClick={() => {
                  triggerHaptic();
                  setThemeOpened((opened) => !opened);
                }}
              >
                <VisuallyHidden>{messages.imageThemePicker.title}</VisuallyHidden>
                {themeLabels[activeTheme]}
                <IconChevronDown size={14} style={styles.chevron(themeOpened)} />
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown>
              <Text fw={600} fz={15} mb="sm">
                {messages.imageThemePicker.title}
              </Text>
              {themeSwatches}
            </Popover.Dropdown>
          </Popover>
        </Box>
      </Box>

      <Box style={styles.actions}>
        <Box style={styles.divider} />
        <Popover
          opened={panelOpened}
          onChange={setPanelOpened}
          position="bottom-end"
          width={PANEL_WIDTH}
          radius="md"
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <Button
              variant="default"
              radius="xl"
              size="sm"
              aria-expanded={panelOpened}
              leftSection={<IconAdjustmentsHorizontal size={18} />}
              onClick={togglePanel}
            >
              {messages.preferencesBar.open}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Text fw={600} fz={15}>
              {copy.title}
            </Text>
            {panelBody}
          </Popover.Dropdown>
        </Popover>
      </Box>
    </Paper>
  );
}
