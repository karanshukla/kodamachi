#!/usr/bin/env bun
// Fails when a .ts/.tsx file under client/src holds a bare English-prose string
// (attribute/property literal, template literal, or JSX text child); UI copy
// belongs in client/src/lib/i18n/en.ts. Heuristic: starts uppercase or contains a
// space. Template literals are judged on their static text outside `${...}`.
// `/* i18n-allow */` on the line exempts it. Skipped whole: locale catalogs
// (`satisfies Messages`), touchpointTranslations.ts, `*.styles.ts`.
// Checker rules: docs/comment-style.md.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const CLIENT_SRC = resolve(REPO_ROOT, "client", "src");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "test-results",
  "playwright-report",
  ".bun",
  "tests",
]);

const TOUCHPOINT_CATALOG = join("lib", "touchpointTranslations.ts");

/**
 * @param {string} dir Directory to descend into.
 * @param {string} [root] Root the skip list is resolved against; defaults to `dir`.
 * @returns {string[]} Absolute paths.
 */
export function walk(dir, root = dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full, root));
      continue;
    }
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
    if (entry.name.endsWith(".styles.ts")) continue;
    if (relative(root, full) === TOUCHPOINT_CATALOG) continue;
    found.push(full);
  }
  return found;
}

// Positions whose value is never prose; CSS values like `1px solid ${x}` trip the space rule.
const ALLOWED_POSITION_NAMES = new Set([
  "rel",
  "d",
  "viewBox",
  "fontFamily",
  "transform",
  "border",
  "borderTop",
]);

// Technical vocabulary: header name, `in window` keys, KeyboardEvent.key, DOMException.name.
const ALLOWED_EXACT_VALUES = new Set([
  "Content-Type",
  "Notification",
  "PushManager",
  "Escape",
  "Enter",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "AbortError",
]);

// Inline JSX text. The closing `</` keeps generics like `Promise<Messages>` from matching.
const INLINE_JSX_TEXT = /> *([^<>{}"'`\n]*[A-Za-z][^<>{}"'`\n]*?) *<\//;

const ESCAPE_MARKER = "i18n-allow";

// Double-quoted literal, with the `name:`/`name=` it is the value of.
const STRING_LITERAL = /(?:([A-Za-z][\w-]*)\s*[:=]\s*)?"((?:[^"\\]|\\.)*)"/g;

// Backtick form; optional `{` because JSX attributes need braces around a template.
// Single-line only: the checker is line-based.
const TEMPLATE_LITERAL = /(?:([A-Za-z][\w-]*)\s*[:=]\s*\{?\s*)?`((?:[^`\\]|\\.)*)`/g;

// SCREAMING_SNAKE wire/platform identifiers (error codes, HTTP methods) are never shown to users.
const IDENTIFIER_TOKEN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

function looksLikeProse(value) {
  if (value.length < 4) return false;
  if (IDENTIFIER_TOKEN.test(value)) return false;
  return /^[A-Z]/.test(value) || value.includes(" ");
}

// Brace-depth aware so `${a ? {x:1}.x : 0}` doesn't desync the scan.
export function staticTextOf(templateContent) {
  let out = "";
  let depth = 0;

  for (let i = 0; i < templateContent.length; i++) {
    const ch = templateContent[i];
    if (depth === 0 && ch === "$" && templateContent[i + 1] === "{") {
      depth = 1;
      i++;
      continue;
    }
    if (depth > 0) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      continue;
    }
    out += ch;
  }

  return out;
}

// Blanks comments but keeps line breaks and string content (a `//` inside a string is not a comment).
export function stripComments(source) {
  let out = "";
  let inBlockComment = false;
  let inLineComment = false;
  let inString = null;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      out += ch === "\n" ? ch : " ";
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      out += ch === "\n" ? ch : " ";
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        out += " ";
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      out += "  ";
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      out += "  ";
      i++;
      continue;
    }
    out += ch;
  }

  return out;
}

/** `satisfies Messages` marks a locale catalog, so new locales are exempt automatically. */
export function isLocaleCatalog(source) {
  return /\bsatisfies\s+Messages\b/.test(source);
}

/** Prettier-wrapped JSX text: the previous line opens a tag and the next closes one. */
export function isOwnLineJsxText(previousLine, line, nextLine) {
  if (/[<>{}();=]/.test(line)) return false;
  return previousLine.trimEnd().endsWith(">") && nextLine.trimStart().startsWith("</");
}

export function checkFile(file, root = REPO_ROOT) {
  const failures = [];
  const source = readFileSync(file, "utf8");
  if (isLocaleCatalog(source)) return failures;
  const originalLines = source.split("\n");
  const codeLines = stripComments(source).split("\n");

  codeLines.forEach((line, index) => {
    if (originalLines[index].includes(ESCAPE_MARKER)) return;

    for (const match of line.matchAll(STRING_LITERAL)) {
      const [, name, value] = match;
      if (!looksLikeProse(value)) continue;
      if (name && ALLOWED_POSITION_NAMES.has(name)) continue;
      if (ALLOWED_EXACT_VALUES.has(value)) continue;
      failures.push(`${relative(root, file)}:${index + 1}: "${value}"`);
    }

    for (const match of line.matchAll(TEMPLATE_LITERAL)) {
      const [, name, content] = match;
      const staticText = staticTextOf(content);
      if (!looksLikeProse(staticText)) continue;
      if (name && ALLOWED_POSITION_NAMES.has(name)) continue;
      failures.push(`${relative(root, file)}:${index + 1}: \`${content}\``);
    }

    const inline = line.match(INLINE_JSX_TEXT);
    const inlineText = inline?.[1].trim();
    if (inlineText && looksLikeProse(inlineText) && !ALLOWED_EXACT_VALUES.has(inlineText)) {
      failures.push(`${relative(root, file)}:${index + 1}: <>${inlineText}</>`);
      return;
    }

    const ownLine = line.trim();
    if (
      isOwnLineJsxText(codeLines[index - 1] ?? "", line, codeLines[index + 1] ?? "") &&
      looksLikeProse(ownLine) &&
      !ALLOWED_EXACT_VALUES.has(ownLine)
    ) {
      failures.push(`${relative(root, file)}:${index + 1}: <>${ownLine}</>`);
    }
  });

  return failures;
}

if (import.meta.main) {
  const files = walk(CLIENT_SRC);
  const failures = files.flatMap((file) => checkFile(file));

  if (failures.length > 0) {
    console.error(`Bare prose string literals (${failures.length}):\n`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      "\nMove the string into client/src/lib/i18n/en.ts, or mark the line `/* i18n-allow */` if it is genuinely not user-facing prose."
    );
    process.exit(1);
  }

  console.log("No bare prose string literals found.");
}
