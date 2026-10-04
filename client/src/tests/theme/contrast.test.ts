import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import appTheme, { ALERT_TONES } from "../../Theme";

import { contrast, flatten, parseColor, type Rgb } from "./colorMath";
import { declaredTokens, paletteTokens, referencedTokens, token, type Scheme } from "./readTokens";

/** Every pair below is text-on-background somewhere in the UI; WCAG AA for body text is 4.5:1. */

const AA = 4.5;
/** WCAG's relaxed threshold, for ≥24px or ≥18.66px-bold text, and for UI shapes. */
const AA_LARGE = 3;

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The primary colour's two palettes: `navy` in light mode, `inverse` in dark. */
const navy = appTheme.colors!.navy!;
const inverse = appTheme.colors!.inverse!;

/** Opaque page background for flattening translucent surfaces; Mantine derives it from the theme, not index.css. */
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

describe("hero surfaces", () => {
  it.each(SCHEMES)("carry their ink and muted text at AA (%s)", (scheme) => {
    const bg = parseColor(token("--ds-hero", scheme));
    expect(ratio("--ds-on-hero", bg, scheme)).toBeGreaterThanOrEqual(AA);
    expect(ratio("--ds-on-hero-muted", bg, scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("label their primary button at AA (%s)", (scheme) => {
    const button = parseColor(token("--ds-on-hero", scheme));
    expect(ratio("--ds-hero", button, scheme)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)("keep the faint ink too weak for text (%s)", (scheme) => {
    // Not a Text colour: dashed rules and ring tracks only.
    const bg = parseColor(token("--ds-hero", scheme));
    expect(ratio("--ds-on-hero-faint", bg, scheme)).toBeLessThan(AA_LARGE);
  });

  it.each(SCHEMES)("stand apart from the card surface (%s)", (scheme) => {
    const hero = parseColor(token("--ds-hero", scheme));
    expect(contrast(hero, surface(scheme))).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe("text on the ask-card presets", () => {
  const DARK_FILLS = ["--ds-fill-ink", "--ds-fill-midnight", "--ds-fill-steel"];
  const FOREGROUNDS = ["--ds-on-fill", "--ds-on-fill-muted"];

  it.each(DARK_FILLS.flatMap((fill) => FOREGROUNDS.map((fg) => [fill, fg] as const)))(
    "%s carries %s at AA",
    (fill, fg) => {
      const bg = parseColor(token(fill));
      expect(contrast(flatten(token(fg), bg), bg)).toBeGreaterThanOrEqual(AA);
    }
  );

  it("the paper preset carries the on-paper ink and muted text at AA", () => {
    const bg = parseColor(token("--ds-fill-paper"));
    expect(ratio("--ds-on-paper", bg, "light")).toBeGreaterThanOrEqual(AA);
    expect(ratio("--ds-on-paper-muted", bg, "light")).toBeGreaterThanOrEqual(AA);
  });

  it("the white button on a preset carries its navy label at AA", () => {
    const bg = parseColor(token("--ds-on-fill"));
    expect(ratio("--ds-on-fill-button-fg", bg, "light")).toBeGreaterThanOrEqual(AA);
  });
});

// WCAG 2.4.11: 3:1 against the card or page; on a hero surface the ring takes the hero's ink.
describe("focus ring", () => {
  it.each(SCHEMES)("shows against the card surface and the page (%s)", (scheme) => {
    expect(ratio("--ds-focus-ring", surface(scheme), scheme)).toBeGreaterThanOrEqual(AA_LARGE);
    const page = flatten(token("--ds-page", scheme), BODY[scheme]);
    expect(ratio("--ds-focus-ring", page, scheme)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe("controls", () => {
  /** autoContrast labels the navy fill white, and the pale dark-mode fill with `black`. */
  it("filled primary buttons carry their label at AA in both schemes", () => {
    const shade = appTheme.primaryShade as number;
    expect(contrast(parseColor(appTheme.white!), parseColor(navy[shade]))).toBeGreaterThanOrEqual(
      AA
    );
    expect(
      contrast(parseColor(appTheme.black!), parseColor(inverse[shade]))
    ).toBeGreaterThanOrEqual(AA);
  });

  it.each([
    ["light", navy],
    ["dark", inverse],
  ] as const)("the filled primary stands apart from the card surface (%s)", (scheme, palette) => {
    const fill = parseColor(palette[appTheme.primaryShade as number]);
    expect(contrast(fill, surface(scheme))).toBeGreaterThanOrEqual(AA_LARGE);
  });

  /** In dark mode Mantine draws outlines from shade 2 and links from shade 4. */
  it("dark-mode outline buttons and links read on the card at AA", () => {
    expect(contrast(parseColor(inverse[2]), surface("dark"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(parseColor(inverse[4]), surface("dark"))).toBeGreaterThanOrEqual(AA);
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

// Mantine's literal tuples and index.css custom properties are two copies of the brand colours; pin each pair.
describe("the Mantine palette and the stylesheet agree", () => {
  const SHADES: [string, string][] = [
    ["--ds-navy", navy[6]],
    ["--ds-steel", navy[5]],
    ["--ds-steel", appTheme.colors!.accent![6]],
    ["--ds-tint", navy[0]],
    ["--ds-tint-deep", navy[1]],
    ["--ds-ink-dark", inverse[0]],
    ["--ds-tint-deep", inverse[2]],
    ["--ds-link-dark", inverse[4]],
    ["--ds-tint", inverse[6]],
    ["--ds-navy-raised", inverse[8]],
    ["--ds-navy", inverse[9]],
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
    ["--ds-navy-raised", appTheme.colors!.dark![6]],
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
