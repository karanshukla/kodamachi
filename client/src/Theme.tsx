import {
  Alert,
  Button,
  Menu,
  Modal,
  Notification,
  Paper,
  Select,
  TextInput,
  Title,
  createTheme,
  virtualColor,
  MantineColorsTuple,
} from "@mantine/core";

/**
 * Navy — the one fill, and the primary colour in light mode. Shade 6 is the
 * brand navy every filled control uses.
 */
const navy: MantineColorsTuple = [
  "#EDF2FB",
  "#C9D5EA",
  "#9BB4E6",
  "#6A8BC7",
  "#3E63A8",
  "#234B94",
  "#10224A",
  "#0D1C3D",
  "#0B1428",
  "#070E1C",
];

/**
 * The primary colour in dark mode, where filled controls invert to a pale fill
 * with a navy label. Not a ramp: in dark mode Mantine reads shade 6 for the
 * fill, 7 for its hover, 2 for outlines, 4 for links and 0 for light-variant
 * text, so each index holds the value that role needs on the navy card.
 */
const inverse: MantineColorsTuple = [
  "#F4F7FC",
  "#E3E8F0",
  "#C9D5EA",
  "#B4C6E8",
  "#9BB4E6",
  "#DCE4F3",
  "#EDF2FB",
  "#DCE4F3",
  "#1A3163",
  "#10224A",
];

/** Link — the second hue, for inline links and the composing-card border. */
const accent: MantineColorsTuple = [
  "#EDF2FB",
  "#D6E0F3",
  "#B4C6E8",
  "#8AA5D8",
  "#5F82C2",
  "#3D63AB",
  "#234B94",
  "#1B3A73",
  "#142B56",
  "#0E1D3B",
];

/** Text ink and its greys; shade 7 is the body ink, 4–6 the muted steps. */
const ink: MantineColorsTuple = [
  "#F7F9FC",
  "#E3E8F0",
  "#C9D5EA",
  "#94A1B8",
  "#7684A0",
  "#63708C",
  "#46536E",
  "#111C36",
  "#0B1428",
  "#070E1C",
];

/** Destructive actions: the one hue outside navy and link. */
const danger: MantineColorsTuple = [
  "#FBF3F3",
  "#F3E0E0",
  "#E1C9C9",
  "#D19E9E",
  "#C07474",
  "#B45050",
  "#A93636",
  "#8E2C2C",
  "#7A2727",
  "#5E1D1D",
];

// Dark mode steps. Cards are the brand navy, which is the --ds-surface token
// rather than a shade here; the page (body) is midnight.
const dark: MantineColorsTuple = [
  "#F4F7FC", // [0] text
  "#C6D0E3", // [1] body text
  "#9BA9C4", // [2] dimmed text
  "#8798B8", // [3] placeholder
  "#2E447A", // [4] border
  "#213875", // [5] hover
  "#1A3163", // [6] raised: default controls, disabled fills
  "#0B1428", // [7] body (midnight page)
  "#08101F", // [8]
  "#050A15", // [9]
];

const DANGER_TONE = {
  rule: "var(--ds-danger-fg)",
  edge: "var(--ds-danger-border)",
  title: "var(--ds-tone-red)",
};
const NAVY_TONE = {
  rule: "var(--ds-accent-text)",
  edge: "var(--mantine-color-default-border)",
  title: "var(--ds-accent-text)",
};
const LINK_TONE = { ...NAVY_TONE, rule: "var(--ds-link)", title: "var(--ds-link)" };

/**
 * Tones for `Alert` and `Notification`, keyed by the Mantine colour a caller
 * passes: a coloured left rule on a paper card. Success, warning and info are
 * navy, accent is the link blue, and danger is the one exception.
 *
 * @see [contrast.test.ts](./tests/theme/contrast.test.ts): pins every title
 * colour against the paper it sits on at WCAG AA.
 */
export const ALERT_TONES = {
  red: DANGER_TONE,
  danger: DANGER_TONE,
  green: NAVY_TONE,
  yellow: NAVY_TONE,
  primary: NAVY_TONE,
  accent: LINK_TONE,
} as const;

function toneFor(color: unknown) {
  return ALERT_TONES[color as keyof typeof ALERT_TONES] ?? NAVY_TONE;
}

/** The card `Alert` and `Notification` share: paper, a hairline, a toned left rule. */
function toneCard(tone: typeof NAVY_TONE) {
  return {
    root: {
      background: "var(--ds-surface)",
      border: `1px solid ${tone.edge}`,
      borderLeft: `3px solid ${tone.rule}` /* i18n-allow */,
    },
    title: { fontWeight: 600, color: tone.title },
  };
}

/** Elevation is scarce: only things that float — menus, modals, toasts. */
const FLOATING_SHADOW = "0 16px 34px -22px rgba(16,34,74,0.5)"; /* i18n-allow */
const MODAL_SHADOW = "0 24px 50px -24px rgba(16,34,74,0.4)"; /* i18n-allow */
const TOAST_SHADOW = "0 10px 24px -18px rgba(16,34,74,0.5)"; /* i18n-allow */

const appTheme = createTheme({
  primaryColor: "primary",
  primaryShade: 6,
  // A filled primary control's label comes from --mantine-color-primary-contrast,
  // which Mantine only computes per scheme with autoContrast on.
  autoContrast: true,
  colors: {
    navy,
    inverse,
    primary: virtualColor({ name: "primary", light: "navy", dark: "inverse" }),
    accent,
    ink,
    danger,
    dark,
  },
  white: "#FFFFFF",
  black: "#111C36",

  fontFamily: "var(--ds-font-sans)",
  lineHeights: { xs: "1.4", sm: "1.45", md: "1.5", lg: "1.55", xl: "1.6" },

  headings: {
    fontFamily: "var(--ds-font-sans)",
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "34px", lineHeight: "1.15", fontWeight: "600" },
      h2: { fontSize: "22px", lineHeight: "1.25", fontWeight: "600" },
      h3: { fontSize: "17px", lineHeight: "1.25", fontWeight: "600" },
      h4: { fontSize: "15px", lineHeight: "1.3", fontWeight: "600" },
    },
  },

  defaultRadius: "md",
  radius: { xs: "4px", sm: "6px", md: "10px", lg: "12px", xl: "14px" },
  spacing: { xs: "8px", sm: "12px", md: "16px", lg: "24px", xl: "32px" },

  shadows: {
    xs: "none",
    sm: "none",
    md: FLOATING_SHADOW,
    lg: FLOATING_SHADOW,
    xl: MODAL_SHADOW,
  },

  components: {
    Button: Button.extend({
      styles: { root: { fontWeight: 600 }, label: { letterSpacing: "-0.01em" } },
    }),

    Title: Title.extend({
      styles: (_theme, { order }) => ({
        root: order === 1 ? { letterSpacing: "-0.03em" } : {},
      }),
    }),

    Paper: Paper.extend({
      defaultProps: { radius: "lg" },
      styles: {
        root: {
          backgroundColor: "var(--ds-surface)",
          borderColor: "var(--mantine-color-default-border)",
        },
      },
    }),

    TextInput: TextInput.extend({
      styles: { label: { fontWeight: 500, marginBottom: 7 }, input: { minHeight: 44 } },
    }),

    Select: Select.extend({ styles: { input: { minHeight: 40 } } }),

    Menu: Menu.extend({
      styles: {
        dropdown: {
          borderRadius: "var(--ds-radius-card)",
          border: "1px solid var(--mantine-color-default-border)",
          padding: 6,
        },
        item: { borderRadius: 9 },
        label: { textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11 },
      },
    }),

    Modal: Modal.extend({
      styles: {
        content: { borderRadius: "var(--ds-radius-card)" },
        title: { fontWeight: 600, fontSize: 17 },
      },
    }),

    Alert: Alert.extend({
      styles: (_theme, props) => ({
        ...toneCard(toneFor(props.color)),
        message: { color: "var(--mantine-color-dimmed)" },
      }),
    }),

    Notification: Notification.extend({
      styles: (_theme, props) => {
        const tone = toneFor(props.color);
        const card = toneCard(tone);
        return {
          ...card,
          root: { ...card.root, boxShadow: TOAST_SHADOW, "--notification-color": tone.rule },
          description: { color: "var(--mantine-color-dimmed)" },
        };
      },
    }),
  },
});

export default appTheme;
