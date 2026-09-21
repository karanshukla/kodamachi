# Design tokens and styling rules (client)

`client/CLAUDE.md` carries the rules in short form. This file is the reasoning.

## Rendering and styling are separate files

A `.tsx` describes structure and behaviour; the CSS objects it needs live in a
sibling `*.styles.ts`, imported as `import * as styles from "./Thing.styles"`.
Anything computed from props is a small named function there
(`card({ ink, pinned, focused })`), not a ternary inline in JSX. Style modules
are excluded from coverage — they are constants and the pure functions that pick
between them, with no behaviour an assertion could pin. Do not let logic drift into
one: if a "style" function needs to know a business rule, the rule belongs in the
component or a hook.

## The three token layers

`client/src/index.css` is the single source of truth for colour, and it is layered —
components may only read from the last two layers:

1. **Brand primitives** — scheme-independent raw values, in three groups.
   - _1a, the brand palette_ (`--ds-navy`, `--ds-ink`, `--ds-steel`, `--ds-paper`,
     `--ds-canvas`, `--ds-line`, `--ds-tint`, `--ds-muted`, `--ds-danger`, and the
     dark steps `--ds-ink-dark`, `--ds-muted-dark`, `--ds-line-dark`,
     `--ds-navy-raised`, …) — the hues a repaint replaces. **Nothing outside
     `index.css` may reference one**, and `contrast.test.ts` fails on any file that
     does. Reaching for `var(--ds-navy)` in a component means the colour needs a
     semantic token; add one here.
   - _1b, the brand fills_ (`--ds-fill-ink`, `--ds-fill-midnight`, `--ds-fill-steel`,
     `--ds-fill-paper`) — the ask-card presets and the image-theme previews. They
     keep their colour in both schemes: a preset is the profile owner's choice, and
     a preview stands for a PNG that does not change. They are solid: the redesign
     has two hues plus danger and no ramps, and a test fails on any `gradient(` in
     the stylesheet.
   - _1c, structural primitives_ (`--ds-font-sans`, `--ds-ease`, `--ds-dur-*`,
     `--ds-radius-*`) — carry no colour and no restriction.
2. **Semantic tokens** (`--ds-surface`, `--ds-page`, `--ds-link`, `--ds-hero`,
   `--ds-mark-bg`, …) — named for the job. Light values on `:root`, dark overrides
   under `:root[data-mantine-color-scheme="dark"]`. **This is why no component calls
   `useComputedColorScheme` to choose a colour** — the browser picks. If you find
   yourself adding an `isDark` prop, add a token instead.
3. **Fixed foregrounds** (`--ds-on-fill`, `--ds-on-fill-muted`, `--ds-on-fill-border`,
   `--ds-on-fill-button-fg`, `--ds-on-paper`, `--ds-on-paper-muted`) — text on an
   ask-card preset. Deliberately _not_ scheme-aware, because the presets keep their
   colour, so the text on one has one correct colour. The paper preset stays white
   in dark mode, which is why its contents read `--ds-on-paper` and not the scheme's
   text colour.

`src/styles/tokens.ts` gives these TypeScript handles so a renamed token is a compile
error rather than a colour that silently resolves to nothing.

## Dark mode is the inverse of light

Navy and white swap roles; nothing new is introduced for the dark scheme.

| Role | Light | Dark |
|---|---|---|
| Page | canvas `#F7F9FC` | midnight `#0B1428` |
| Card (`--ds-surface`) | paper white | brand navy `#10224A` |
| Text | navy ink | white ink `#F4F7FC` |
| Hero (`--ds-hero`) | navy, white ink | off-white, navy ink |
| Filled button | navy, white label | pale tint, navy label |
| Inputs (`--ds-surface-ghost`) | canvas well | midnight well |

Filled controls flip through Mantine rather than CSS: `primary` is a
`virtualColor` (navy in light, the inverse scale in dark) and `autoContrast` picks
the label. Mantine's switch thumb is
always white, so on the white dark-mode track it takes the navy paper instead (the
switch rule in `index.css`).

The ask-card presets and the image-theme previews are the only things that do not
invert. Each preset carries a hairline, because one of them always matches what
sits behind it.

## The design source

The redesign is the Claude Design handoff vendored at `docs/design/kodamachi-handoff/`
(`Kodamachi Foundations.dc.html` holds the palette, type and chrome rules; `github.md`
maps each screen to the files under `client/src`). The handoff reserves mascot slots
but supplies no artwork, so the app ships no mascot until there is a real drawing.
The rules that matter for code:

- **Two hues plus danger.** Navy (`#10224A`) and Link (`#234B94`) carry every state;
  success and warning are an icon plus navy text, never green or amber.
- **Hover is a fill, never a lift.** Inline cards carry a hairline and no shadow;
  shadows exist only for things that float (menus, modals, toasts). In dark mode
  elevation becomes the `--ds-line-dark` border.
- **One focus ring**: 2px Link with a 2px offset, set globally on `:focus-visible`.
- **The mark is 木**, Noto Serif JP weight 600, drawn as an SVG outline so no serif
  webfont ships. The path lives once, in `brand.json` (`markGlyphPath`), and every
  renderer reads it from there: `BrandMark.tsx`, the generated `favicon.svg` and
  `mark.svg`, the OG template and the question-image templates. The wordmark is
  lowercase, one tone.
- **Type** is Schibsted Grotesk with Noto Sans JP behind it for Japanese questions,
  600 for headings, page titles at −0.03em (the `Title` override in `Theme.tsx`), a
  1.5 body line-height set globally, `palt` on.

## Repainting the brand

Colour lives in four places. The first two are checked against each other; the
last two are separate services and cannot be, so they are the ones to remember:

1. `client/src/index.css`, layer 1a — the `--ds-*` palette. The `rgba()` tints in
   layers 2 and 3 spell their channels out rather than referencing a palette token,
   so they need editing too; `grep -n 'rgba(' client/src/index.css` lists them.
2. `client/src/Theme.tsx` — Mantine's `MantineColorsTuple`s, which cannot be CSS
   variables because Mantine derives hover, light and outline variants from literal
   values, along with `white` and `black`.
3. `opengraph-service/internal/shim/template.go` — the share-card renderer mirrors
   the palette in Go constants (`ogFillNavy`, `ogText`, …). Its own tests check that
   the card stays legible, not that it still matches the app.
4. `server/src/lib/question-image/themes/*.ts` — the three question-image themes
   carry their hexes inline for the same reason.

The second is a copy of the first, so `contrast.test.ts` pins every shared shade,
the dark steps included: change a hex in one and the suite names the token that no
longer agrees. Work outward from layer 1a — semantic tokens resolve through it, and
no component names a hue at all, so nothing below the palette should need editing.

Palette entries are named for the job they do (`primary`, `accent`, `ink`, `danger`
in Mantine; `navy`, `steel`, `ink`, `paper`, … in CSS), so a repaint changes values
and leaves every name and call site alone. The ask-card preset keys
(`royal`/`aurora`/`ember`/`verdant`) are persisted user settings and keep their old
names under new labels — `client/src/lib/themes.ts` says which fill each maps to.

The suite is the acceptance test for a repaint: contrast pairs are re-checked at
WCAG AA, so a hue that reads well on white and badly on the dark surface fails
before it ships.

## Hero surfaces and fills

- `--ds-hero` — the welcome card, the inbox link, "ink" question cards and a profile
  banner with no image. Text on it reads `--ds-on-hero*`; its buttons are
  `heroButton` and `heroOutlineButton` in `tokens.ts`. `--ds-on-hero-faint` is for
  dashed rules and progress tracks; it is not strong enough for text and a test
  pins that.
- `--ds-fill-*` — the four ask-card presets (ink is the default) and the
  image-theme previews. Paper is the one light fill and paints its contents with
  the on-paper tokens.

Nav active state uses the tint (`--ds-nav-active-bg`), the unread badge the navy
pill (`--ds-attention-bg`). Nothing anywhere is a gradient.

## Overriding a Mantine variable

Mantine declares its scheme variables at `:root[data-mantine-color-scheme="…"]`
(specificity 0,2,0). A bare `[data-mantine-color-scheme="…"]` block loses to it and
silently does nothing — which is what had happened to the light-mode
`--mantine-color-body` and `--mantine-color-default-border` overrides. Match the
selector exactly, and only for variables the provider does not re-emit at runtime:
`--mantine-color-body` comes from `theme.white` / `dark[7]`, and brand text colours
come from `--ds-accent-text` / `--ds-link` rather than fighting the provider's
`--mantine-color-*-text`.

The same goes for component colours Mantine keeps in variables. Inputs read
`--input-bg` and `--input-bd` from their wrapper, and the focus and error states
work by swapping those variables; setting `background` or `border-color` on the
input instead would pin one colour over all three states.

## Contrast is enforced, not reviewed

`src/tests/theme/contrast.test.ts` parses `index.css`, resolves the tokens, and fails
if any documented text/background pair drops below WCAG AA — on every fill, on the
hero in both schemes, and for every `Alert` tone against the paper it sits on. It
also checks that the hero and the filled primary stand apart from the card, and it
fails on a declared `--ds-*` token nothing references and on a referenced token
nothing declares, so the palette cannot accumulate dead entries or typos.
