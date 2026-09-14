import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import appTheme, { ALERT_TONES } from "../../Theme";

import { contrast, flatten, parseColor, type Rgb } from "./colorMath";
import { declaredTokens, paletteTokens, referencedTokens, token, type Scheme } from "./readTokens";

/**
 * The palette's accessibility rules, executable.
 *
 * Every pair below is text-on-background somewhere in the UI, and WCAG AA for
 * body text is 4.5:1. Lowering a token past that is a failing test rather than a
 * regression someone notices in a screenshot months later.
 */

const AA = 4.5;
/** WCAG's relaxed threshold, for ≥24px or ≥18.66px-bold text only. */
const AA_LARGE = 3;

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Opaque page background a translucent surface has to be flattened against.
 * Mantine derives it from the theme (`theme.white` / `dark[7]`), not from
 * index.css, so it is read from the same place the browser reads it.
 */
const BODY: Record<Scheme, Rgb> = {
  light: parseColor(appTheme.white!),
  dark: parseColor(appTheme.colors!.dark![7]),
};

function surface(scheme: Scheme): Rgb {
  return flatten(token("--ds-surface", scheme), BODY[scheme]);
}

function ratio(fg: string, bg: Rgb, scheme: Scheme): number {
  return contrast(flatten(token(fg, scheme), bg), bg);
}

const SCHEMES: Scheme[] = ["light", "dark"];

describe("body text", () => {
  it.each(SCHEMES)("dimmed text clears AA on the card surface (%s)", (scheme) => {
    expect(ratio("--mantine-color-dimmed", surface(scheme), scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("dimmed text clears AA on the page background (%s)", (scheme) => {
    expect(ratio("--mantine-color-dimmed", BODY[scheme], scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("dimmed text clears AA on the ghost surface (%s)", (scheme) => {
    const ghost = flatten(token("--ds-surface-ghost", scheme), BODY[scheme]);
    expect(ratio("--mantine-color-dimmed", ghost, scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("dimmed text clears AA on the page column (%s)", (scheme) => {
    const page = flatten(token("--ds-page", scheme), BODY[scheme]);
    expect(ratio("--mantine-color-dimmed", page, scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("brand-accented body text clears AA on the card surface (%s)", (scheme) => {
    expect(ratio("--ds-accent-text", surface(scheme), scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("link colour clears AA on the card surface (%s)", (scheme) => {
    expect(ratio("--ds-link", surface(scheme), scheme)).toBeGreaterThanOrEqual(AA);
  });
});

describe("text on brand fills", () => {
  const DARK_FILLS = ["--ds-fill-ink", "--ds-fill-midnight", "--ds-fill-steel"];
  const FOREGROUNDS = ["--ds-on-fill", "--ds-on-fill-muted"];

  it.each(
    SCHEMES.flatMap((scheme) =>
      DARK_FILLS.flatMap((fill) => FOREGROUNDS.map((fg) => [scheme, fill, fg] as const))
    )
  )("%s: %s carries %s at AA", (scheme, fill, fg) => {
    // Alpha-carrying foregrounds are flattened against the fill itself.
    const bg = flatten(token(fill, scheme), BODY[scheme]);
    expect(contrast(flatten(token(fg), bg), bg)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)(
    "the paper fill carries the on-paper ink and muted text at AA (%s)",
    (scheme) => {
      const bg = flatten(token("--ds-fill-paper", scheme), BODY[scheme]);
      expect(ratio("--ds-on-paper", bg, scheme)).toBeGreaterThanOrEqual(AA);
      expect(ratio("--ds-on-paper-muted", bg, scheme)).toBeGreaterThanOrEqual(AA);
    }
  );

  it("the faint on-fill token is not strong enough for text", () => {
    // Pinned so nobody promotes it to a Text colour: it exists for dashed rules
    // and progress-ring tracks, where contrast is not a legibility requirement.
    const bg = parseColor(token("--ds-fill-ink"));
    expect(contrast(flatten(token("--ds-on-fill-faint"), bg), bg)).toBeLessThan(AA_LARGE);
  });

  it("the white button on a fill carries its navy label at AA", () => {
    const bg = parseColor(token("--ds-on-fill"));
    expect(ratio("--ds-on-fill-button-fg", bg, "light")).toBeGreaterThanOrEqual(AA);
  });
});

describe("controls", () => {
  it("filled primary buttons carry white labels at AA", () => {
    const fill = appTheme.colors!.primary![appTheme.primaryShade as number];
    expect(contrast(parseColor(appTheme.white!), parseColor(fill))).toBeGreaterThanOrEqual(AA);
  });

  it("destructive buttons carry white labels at AA", () => {
    expect(
      contrast(parseColor(appTheme.white!), parseColor(appTheme.colors!.danger![6]))
    ).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("the active nav item is legible on its own tint (%s)", (scheme) => {
    const bg = flatten(token("--ds-nav-active-bg", scheme), BODY[scheme]);
    expect(ratio("--ds-nav-active-color", bg, scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("the unread badge carries its numeral at AA (%s)", (scheme) => {
    const bg = flatten(token("--ds-attention-bg", scheme), BODY[scheme]);
    expect(ratio("--ds-attention-fg", bg, scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("the mark tile carries its glyph at AA (%s)", (scheme) => {
    const bg = flatten(token("--ds-mark-bg", scheme), BODY[scheme]);
    expect(ratio("--ds-mark-fg", bg, scheme)).toBeGreaterThanOrEqual(AA);
  });
});

describe("alert tones", () => {
  const cases = SCHEMES.flatMap((scheme) =>
    Object.entries(ALERT_TONES).map(([name, tone]) => [scheme, name, tone] as const)
  );

  /** Every alert is a paper card with a coloured rule, so titles read on paper. */
  it.each(cases)("%s: the %s title is legible on the card surface", (scheme, _name, tone) => {
    expect(ratio(tone.title, surface(scheme), scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(cases)("%s: the %s rule is visible against the card surface", (scheme, _name, tone) => {
    expect(ratio(tone.rule, surface(scheme), scheme)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

/**
 * Mantine's palette and `index.css` are two independent copies of the same brand
 * colours, and they have to be: Mantine needs literal tuples to derive hover,
 * light and outline variants from, the browser needs custom properties. So a
 * repaint has to edit both, and a half-finished one is invisible — the filled
 * buttons change and one border stays the old hue. Each pair below is pinned so
 * that stops being something you have to notice.
 */
describe("the Mantine palette and the stylesheet agree", () => {
  const SHADES: [string, string][] = [
    ["--ds-navy", appTheme.colors!.primary![6]],
    ["--ds-steel", appTheme.colors!.primary![5]],
    ["--ds-steel", appTheme.colors!.accent![6]],
    ["--ds-tint", appTheme.colors!.primary![0]],
    ["--ds-tint-deep", appTheme.colors!.primary![1]],
    ["--ds-ink", appTheme.colors!.ink![7]],
    ["--ds-muted", appTheme.colors!.ink![5]],
    ["--ds-midnight", appTheme.colors!.dark![7]],
    ["--ds-line", appTheme.colors!.ink![1]],
    ["--ds-danger", appTheme.colors!.danger![6]],
    ["--ds-danger-border", appTheme.colors!.danger![2]],
    ["--ds-tone-red", appTheme.colors!.danger![8]],
    ["--ds-paper", appTheme.white!],
    ["--ds-ink", appTheme.black!],
    ["--ds-ink-dark", appTheme.colors!.dark![0]],
    ["--ds-muted-dark", appTheme.colors!.dark![2]],
    ["--ds-line-dark", appTheme.colors!.dark![4]],
    ["--ds-midnight-hover", appTheme.colors!.dark![5]],
    ["--ds-midnight-card", appTheme.colors!.dark![6]],
  ];

  it.each(SHADES)("%s is the same colour as its Mantine shade", (name, shade) => {
    expect(parseColor(shade)).toEqual(parseColor(token(name)));
  });
});

describe("token hygiene", () => {
  it("declares no --ds-* token that nothing references", async () => {
    const sources = await collectSources(SRC);
    const used = referencedTokens(sources.map((s) => s.text));
    const orphans = declaredTokens().filter((name) => !used.has(name));
    expect(orphans).toEqual([]);
  });

  it("references no --ds-* token that nothing declares", async () => {
    const declared = new Set(declaredTokens());
    const sources = await collectSources(SRC);
    const undeclared = [...referencedTokens(sources.map((s) => s.text))].filter(
      (name) => !declared.has(name)
    );
    expect(undeclared).toEqual([]);
  });

  /**
   * The rule that makes a repaint a one-file change. A component naming a hue
   * directly is invisible until someone swaps the palette and one border stays
   * the old blue, so it fails here instead: give the colour a semantic token in
   * index.css and reference that.
   */
  it("keeps the brand palette out of everything but index.css", async () => {
    const palette = new Set(paletteTokens());
    const sources = await collectSources(SRC);
    const leaks = sources
      .filter((s) => !s.path.endsWith("index.css"))
      .flatMap((s) =>
        [...referencedTokens([s.text])]
          .filter((name) => palette.has(name))
          .map((name) => `${relative(SRC, s.path).split(sep).join("/")} -> ${name}`)
      );
    expect(leaks).toEqual([]);
  });

  it("declares no gradient anywhere in the stylesheet", () => {
    const css = readFileSync(join(SRC, "index.css"), "utf8");
    expect(css).not.toMatch(/gradient\(/);
  });
});

interface Source {
  path: string;
  text: string;
}

async function collectSources(dir: string): Promise<Source[]> {
  const out: Source[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectSources(path)));
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      out.push({ path, text: readFileSync(path, "utf8") });
    }
  }
  return out;
}
