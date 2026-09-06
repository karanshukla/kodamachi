import assert from "node:assert";
import { test, describe } from "bun:test";

import { isThemeName } from "../lib/question-image/layout";
import { renderQuestionCard } from "../lib/question-image/templates";

describe("renderQuestionCard", () => {
  test("default theme returns correct html with width 360", () => {
    const result = renderQuestionCard("default", "hello", "navyfragen.app", "hello");
    assert.strictEqual(result.width, 360);
    assert.ok(result.html.includes("hello"));
    assert.ok(result.height > 0);
  });

  test("compressed theme returns correct html with width 380", () => {
    const result = renderQuestionCard("compressed", "hello", "navyfragen.app", "hello");
    assert.strictEqual(result.width, 380);
    assert.ok(result.html.includes("hello"));
  });

  test("twitter theme returns correct html with width 420", () => {
    const result = renderQuestionCard("twitter", "hello", "navyfragen.app", "hello");
    assert.strictEqual(result.width, 420);
    assert.ok(result.html.includes("hello"));
  });

  test("a theme name this server has never heard of is not a theme name", () => {
    assert.strictEqual(isThemeName("neon"), false);
    assert.strictEqual(isThemeName("twitter"), true);
  });

  test("twitter theme with handle includes mention", () => {
    const result = renderQuestionCard(
      "twitter",
      "hello",
      "fragen.navy/myhandle",
      "hello",
      "myhandle"
    );
    assert.ok(result.html.includes("@myhandle"));
  });

  // 'Noto Color Emoji' gives U+0020 a 1.25em advance, so anywhere but last in
  // the stack it wins the space glyph whenever the webfonts ahead of it have
  // not loaded, and every word gap in the image blows out to ~4.5x.
  test("emoji family is last in the font stack, after the generic", () => {
    const { html } = renderQuestionCard("default", "hello", "navyfragen.app", "hello");
    for (const stack of [...html.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1])) {
      if (!stack.includes("Noto Color Emoji")) continue;
      const families = stack.split(",").map((f) => f.trim());
      assert.ok(
        families[families.length - 1].includes("Noto Color Emoji"),
        `emoji family must be last, got: ${stack}`
      );
    }
  });

  // The other side of that boundary: dropping to the bare generic is not enough,
  // because a container without the webfonts needs a real text family that is
  // installed locally — otherwise the emoji font is still the only match.
  test("font stack keeps an offline text fallback ahead of the generic", () => {
    const { html } = renderQuestionCard("default", "hello", "navyfragen.app", "hello");
    const stack = html.match(/font-family:\s*('Noto Sans'[^;]+);/)?.[1];
    assert.ok(stack, "expected the Noto stack in the rendered CSS");
    const beforeGeneric = stack.slice(0, stack.indexOf("sans-serif"));
    assert.ok(
      beforeGeneric.includes("Liberation Sans") && beforeGeneric.includes("DejaVu Sans"),
      `expected local text fallbacks before the generic, got: ${stack}`
    );
  });

  test("emoji message produces same height as equal-length ascii message", () => {
    // 5 emojis == 5 visible characters; should produce same layout as 5 ascii chars
    const emojiResult = renderQuestionCard("default", "👋👋👋👋👋", "navyfragen.app", "👋👋👋👋👋");
    const asciiResult = renderQuestionCard("default", "hello", "navyfragen.app", "hello");
    assert.strictEqual(emojiResult.height, asciiResult.height);
  });
});
