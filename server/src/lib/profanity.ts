import {
  DataSet,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  parseRawPattern,
} from "obscenity";

import { ordinaryWordsToNeverFlag, profaneWordsByLanguage } from "./profanity-wordlists";
import type { ProfaneWord, ProfanityLanguage } from "./profanity-wordlists";

interface PhraseMetadata {
  originalWord: string;
  language?: ProfanityLanguage;
}

export interface ProfanityMatch {
  readonly word: string;
  readonly language: ProfanityLanguage;
}

/**
 * Longest run of one letter obscenity's transformers leave standing; every
 * other letter collapses to one, so a pattern with an uncollapsed run
 * (`connard`) can never fire.
 *
 * @see [profanity.test.ts](../tests/profanity.test.ts) — "every listed word
 * matches itself", the test that catches a run this table gets wrong.
 */
const LETTER_RUN_LIMITS: ReadonlyMap<string, number> = new Map([
  ["b", 2],
  ["e", 2],
  ["g", 2],
  ["l", 2],
  ["o", 2],
  ["s", 2],
]);

function collapseRuns(word: string): string {
  let collapsed = "";
  let previous = "";
  let run = 0;
  for (const letter of word) {
    run = letter === previous ? run + 1 : 1;
    previous = letter;
    if (run <= (LETTER_RUN_LIMITS.get(letter) ?? 1)) collapsed += letter;
  }
  return collapsed;
}

function foldDiacritics(word: string): string {
  return word.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * obscenity folds `ß` to `b`, so a `ß` spelling would reach the matcher as
 * `scheibe`. Expand to `ss` first, on both sides.
 *
 * @see [profanity.test.ts](../tests/profanity.test.ts) — "catches the ß
 * spelling" / "leaves the ordinary word Scheibe alone".
 */
function expandEszett(text: string): string {
  return text.replace(/ß/g, "ss");
}

/** Left-anchored so stems catch inflections but not mid-word hits; `boundedEnd` anchors both sides. */
function toMatcherPattern({ word, boundedEnd }: ProfaneWord): string {
  const stem = collapseRuns(foldDiacritics(expandEszett(word.toLowerCase())));
  return `|${stem}${boundedEnd ? "|" : ""}`;
}

function buildDataset(): DataSet<PhraseMetadata> {
  const dataset = new DataSet<PhraseMetadata>().addAll(englishDataset);
  const seen = new Set<string>();
  for (const [language, words] of Object.entries(profaneWordsByLanguage) as [
    ProfanityLanguage,
    readonly ProfaneWord[],
  ][]) {
    for (const entry of words) {
      const pattern = toMatcherPattern(entry);
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      dataset.addPhrase((phrase) =>
        phrase
          .setMetadata({ originalWord: entry.word, language })
          .addPattern(parseRawPattern(pattern))
      );
    }
  }
  return dataset.addPhrase((phrase) => {
    for (const word of ordinaryWordsToNeverFlag) phrase.addWhitelistedTerm(word);
    return phrase.setMetadata({ originalWord: "" });
  });
}

/**
 * obscenity whitelists bare `fick` to protect "trafficking", which makes the
 * German `fick` unmatchable (whitelist outranks blacklist). Narrow it to the
 * protected word.
 *
 * @see [profanity.test.ts](../tests/profanity.test.ts) — "trafficking is not
 * profanity" / "fick dich is".
 */
const OVER_BROAD_ENGLISH_WHITELIST = "fick";

const dataset = buildDataset();
const { blacklistedTerms, whitelistedTerms } = dataset.build();

const matcher = new RegExpMatcher({
  blacklistedTerms,
  whitelistedTerms: whitelistedTerms?.filter((term) => term !== OVER_BROAD_ENGLISH_WHITELIST),
  ...englishRecommendedTransformers,
});

/**
 * Screens text against every supported language at once: an anonymous sender
 * has no locale to select a wordlist by.
 *
 * Returns the entry that fired, not a boolean: a flagged message is dropped
 * silently, so this is the only trace. It never contains message content.
 *
 * @see [profanity.test.ts](../tests/profanity.test.ts) — matches per language,
 * evasion-shaped inputs, and the ordinary sentences that must never be flagged.
 */
export function findProfanity(text: string): ProfanityMatch | null {
  if (!text) return null;
  const [match] = matcher.getAllMatches(expandEszett(text), true);
  if (!match) return null;
  const { phraseMetadata } = dataset.getPayloadWithPhraseMetadata(match);
  return {
    word: phraseMetadata?.originalWord ?? "",
    language: phraseMetadata?.language ?? "en",
  };
}
