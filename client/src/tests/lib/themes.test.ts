import { describe, it, expect } from "vitest";

import { en } from "../../lib/i18n/en";
import {
  imageThemeIds,
  imageThemeLabels,
  profileCardThemes,
  profileCardFill,
} from "../../lib/themes";

describe("imageThemeLabels", () => {
  it("has all three theme keys", () => {
    const themes = imageThemeLabels(en);
    expect(themes).toHaveProperty("default");
    expect(themes).toHaveProperty("compressed");
    expect(themes).toHaveProperty("twitter");
  });

  it("maps theme ids to the catalog's display strings", () => {
    const themes = imageThemeLabels(en);
    for (const id of imageThemeIds) {
      expect(themes[id]).toBe(en.themes.image[id]);
    }
  });
});

describe("profileCardThemes (#275)", () => {
  it("includes the curated preset set", () => {
    expect(Object.keys(profileCardThemes(en)).sort()).toEqual([
      "aurora",
      "ember",
      "royal",
      "verdant",
    ]);
  });

  it("each preset has a label and a fill token (no raw hex)", () => {
    for (const theme of Object.values(profileCardThemes(en))) {
      expect(typeof theme.label).toBe("string");
      expect(theme.label.length).toBeGreaterThan(0);
      // Fills reference --ds-fill-* tokens, never inline colours.
      expect(theme.background).toMatch(/^var\(--ds-fill-/);
    }
  });

  it("royal is the navy ink fill, the app's default", () => {
    expect(profileCardThemes(en).royal.background).toBe("var(--ds-fill-ink)");
  });

  it("verdant is the one light fill", () => {
    const themes = profileCardThemes(en);
    expect(Object.keys(themes).filter((id) => themes[id].paper)).toEqual(["verdant"]);
  });
});

describe("profileCardFill", () => {
  it("resolves a known theme key to its fill", () => {
    expect(profileCardFill("ember").background).toBe("var(--ds-fill-midnight)");
    expect(profileCardFill("aurora").background).toBe("var(--ds-fill-steel)");
  });

  it("falls back to the navy fill when unset (null)", () => {
    expect(profileCardFill(null).background).toBe("var(--ds-fill-ink)");
  });

  it("falls back to the navy fill for an unknown key", () => {
    expect(profileCardFill("neon").background).toBe("var(--ds-fill-ink)");
  });
});
