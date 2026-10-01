import assert from "node:assert";
import { test, describe } from "bun:test";

import { messageFontSize, wrapLines } from "../lib/question-image/layout";

describe("messageFontSize", () => {
  const scale = { large: 26, medium: 21, small: 17 };

  test("returns large when length <= 60", () => {
    assert.strictEqual(messageFontSize(scale, 30), 26);
    assert.strictEqual(messageFontSize(scale, 60), 26);
  });

  test("returns medium when length 61-120", () => {
    assert.strictEqual(messageFontSize(scale, 61), 21);
    assert.strictEqual(messageFontSize(scale, 120), 21);
  });

  test("returns small when length > 120", () => {
    assert.strictEqual(messageFontSize(scale, 121), 17);
    assert.strictEqual(messageFontSize(scale, 300), 17);
  });
});

describe("wrapLines", () => {
  // charsPerLine = areaWidth / (fontSize * charWidthCoeff) = 10

  test("returns 1 for a single short word", () => {
    assert.strictEqual(wrapLines("hello", 10, 100, 1.0), 1);
  });

  test("word fits on existing line (lineChars + 1 + word <= charsPerLine)", () => {
    assert.strictEqual(wrapLines("ab cd", 10, 100, 1.0), 1);
  });

  test("word wraps to new line when combined length exceeds charsPerLine", () => {
    assert.strictEqual(wrapLines("hello world", 10, 100, 1.0), 2);
  });

  test("empty paragraph (blank line in text) counts as a line", () => {
    assert.strictEqual(wrapLines("hello\n\nworld", 10, 100, 1.0), 3);
  });

  test("long word on a fresh line (lineChars === 0)", () => {
    assert.strictEqual(wrapLines("abcdefghijklmnopqrstu", 10, 100, 1.0), 3);
  });

  test("long word when lineChars > 0 triggers extra line break", () => {
    assert.strictEqual(wrapLines("hi abcdefghijklmnopqrstu", 10, 100, 1.0), 4);
  });

  test("word length exact multiple of charsPerLine uses || charsPerLine branch", () => {
    assert.strictEqual(wrapLines("abcdefghijabcdefghij", 10, 100, 1.0), 2);
  });

  test("returns at least 1 for empty string", () => {
    assert.strictEqual(wrapLines("", 10, 100, 1.0), 1);
  });

  test("emoji characters count as 1 not 2 (surrogate pair fix)", () => {
    assert.strictEqual(wrapLines("hi 👋", 10, 100, 1.0), 1);
    assert.strictEqual(wrapLines("😀😀😀😀😀😀😀😀😀😀", 10, 100, 1.0), 1);
    assert.strictEqual(wrapLines("😀😀😀😀😀😀😀😀😀😀😀", 10, 100, 1.0), 2);
  });
});
