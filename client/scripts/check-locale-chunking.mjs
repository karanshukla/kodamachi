#!/usr/bin/env bun
// Asserts on dist/ build output (#406, #410) that each locale catalog ships as its own lazy chunk:
// its marker text is present, absent from the entry scripts, and not shared with another locale.
// Run after `bun run build`. Chunks are identified by content, since Rollup renames hashed files.

import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const CLIENT_ROOT = resolve(import.meta.dir, "..");
const DIST_DIR = resolve(CLIENT_ROOT, "dist");
const DIST_ASSETS = resolve(DIST_DIR, "assets");
const INDEX_HTML = resolve(DIST_DIR, "index.html");

// A phrase found only in that locale's catalog; update it if the catalog wording changes.
const LOCALE_MARKERS = {
  es: "no leídos",
  pt: "não lida",
  de: "Thread-Ausgangsnachricht",
  fr: "non lu",
};

function fail(message) {
  console.error(`check:locale-chunking: ${message}`);
  process.exit(1);
}

let assetFiles;
try {
  assetFiles = readdirSync(DIST_ASSETS).filter((file) => extname(file) === ".js");
} catch {
  fail(`could not read ${DIST_ASSETS} — run \`bun run build\` first.`);
}

let indexHtml;
try {
  indexHtml = readFileSync(INDEX_HTML, "utf8");
} catch {
  fail(`could not read ${INDEX_HTML} — run \`bun run build\` first.`);
}

const entryScripts = new Set(
  [...indexHtml.matchAll(/<script[^>]*type="module"[^>]*src="\/assets\/([^"]+)"/g)].map(
    (match) => match[1]
  )
);
if (entryScripts.size === 0) {
  fail('found no entry <script type="module"> tags in dist/index.html.');
}

const assetContents = new Map(
  assetFiles.map((file) => [file, readFileSync(join(DIST_ASSETS, file), "utf8")])
);

const summaries = [];
/** Locale → the dist chunk files its marker was found in. */
const chunksByLocale = new Map();

for (const [locale, marker] of Object.entries(LOCALE_MARKERS)) {
  const filesWithMarker = assetFiles.filter((file) => assetContents.get(file).includes(marker));

  if (filesWithMarker.length === 0) {
    fail(
      `no file in dist/assets contains ${JSON.stringify(marker)} — either the ${locale} catalog was not bundled, or its wording changed and this script's marker needs updating to match client/src/lib/i18n/${locale}.ts.`
    );
  }

  const markerInEntry = filesWithMarker.filter((file) => entryScripts.has(file));
  if (markerInEntry.length > 0) {
    fail(
      `the ${locale} catalog is bundled into an entry chunk (${markerInEntry.join(", ")}), not lazy-loaded into its own chunk — check the \`import("./${locale}")\` loader in client/src/lib/i18n/index.tsx.`
    );
  }

  chunksByLocale.set(locale, filesWithMarker);
  summaries.push(`${locale} (${filesWithMarker.join(", ")})`);
}

// Rollup may fold the catalogs into one shared chunk, which passes the checks above.
for (const [locale, files] of chunksByLocale) {
  for (const [otherLocale, otherFiles] of chunksByLocale) {
    if (locale >= otherLocale) continue;
    const shared = files.filter((file) => otherFiles.includes(file));
    if (shared.length > 0) {
      fail(
        `the ${locale} and ${otherLocale} catalogs share a chunk (${shared.join(", ")}), so picking either downloads both — check the \`import("./<locale>")\` loaders in client/src/lib/i18n/index.tsx.`
      );
    }
  }
}

console.log(
  `OK: ${summaries.join(", ")} each ship in their own chunk, separate from the entry bundle (${[...entryScripts].join(", ")}).`
);
