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
  // charsPerLine = areaWidth / (fontSize * charWidthCoeff) = 100 / (10 * 1.0) = 10

  test("returns 1 for a single short word", () => {
    assert.strictEqual(wrapLines("hello", 10, 100, 1.0), 1);
  });

  test("word fits on existing line (lineChars + 1 + word <= charsPerLine)", () => {
    // "ab cd" => "ab"(2) + space + "cd"(2) = 5 <= 10, fits on one line
    assert.strictEqual(wrapLines("ab cd", 10, 100, 1.0), 1);
  });

  test("word wraps to new line when combined length exceeds charsPerLine", () => {
    // "hello world" => "hello"(5), then 5+1+5=11 > 10, wraps -> 2 lines
    assert.strictEqual(wrapLines("hello world", 10, 100, 1.0), 2);
  });

  test("empty paragraph (blank line in text) counts as a line", () => {
    // "hello\n\nworld" => ["hello", "", "world"] => 1 + 1 (empty) + 1 = 3
    assert.strictEqual(wrapLines("hello\n\nworld", 10, 100, 1.0), 3);
  });

  test("long word on a fresh line (lineChars === 0)", () => {
    // 21-char word, charsPerLine=10: ceil(21/10)-1=2 extra lines, lineChars = 21%10 = 1
    // total pLines = 1 + 2 = 3
    assert.strictEqual(wrapLines("abcdefghijklmnopqrstu", 10, 100, 1.0), 3);
  });

  test("long word when lineChars > 0 triggers extra line break", () => {
    // "hi abcdefghijklmnopqrstu": "hi"(2) then 21-char word with lineChars=2 > 0 -> pLines++
    // pLines = 1 -> "hi" sets lineChars=2 -> 21-char word: pLines++(2), pLines+=2(4), lineChars=1
    assert.strictEqual(wrapLines("hi abcdefghijklmnopqrstu", 10, 100, 1.0), 4);
  });

  test("word length exact multiple of charsPerLine uses || charsPerLine branch", () => {
    // 20-char word, charsPerLine=10: 20%10 = 0, so lineChars = 0 || 10 = 10
    // ceil(20/10)-1 = 1 extra line, pLines = 1+1 = 2
    assert.strictEqual(wrapLines("abcdefghijabcdefghij", 10, 100, 1.0), 2);
  });

  test("returns at least 1 for empty string", () => {
    assert.strictEqual(wrapLines("", 10, 100, 1.0), 1);
  });

  test("emoji characters count as 1 not 2 (surrogate pair fix)", () => {
    // "hi 👋" => "hi"(2) + space + "👋"(1 code point) = 4 total, fits on one line of 10
    assert.strictEqual(wrapLines("hi 👋", 10, 100, 1.0), 1);
    // 10 emojis => 10 code points, exactly fills one line
    assert.strictEqual(wrapLines("😀😀😀😀😀😀😀😀😀😀", 10, 100, 1.0), 1);
    // 11 emojis => wraps to 2 lines
    assert.strictEqual(wrapLines("😀😀😀😀😀😀😀😀😀😀😀", 10, 100, 1.0), 2);
  });
});
