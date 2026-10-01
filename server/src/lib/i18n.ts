/**
 * Server-side catalog for strings built with no browser: push notification
 * title/body and seeded example questions. Separate from the client's catalog
 * (`client/src/lib/i18n/`); no shared keys. Keyed off `uiLocale`, never
 * `touchpointLocale`: the owner reads both, not their audience.
 */
import { APP_NAME } from "./brand";

export interface ServerMessages {
  push: {
    titleForHandle: (handle: string) => string;
    titleAnonymous: string;
    body: string;
  };
  exampleQuestions: readonly string[];
}

export type ServerLocale = "en" | "es" | "pt" | "de" | "fr";

const en = {
  push: {
    titleForHandle: (handle: string) => `New question for @${handle}`,
    titleAnonymous: "New anonymous question",
    body: `Someone sent you an anonymous question on ${APP_NAME}!`,
  },
  exampleQuestions: [
    "Do you like cats?",
    "Do you like dogs?",
    "What's your favorite movie?",
    "If you could travel anywhere, where would you go?",
    "What's something most people don't know about you?",
    "What's the best piece of advice you've ever received?",
    "What are you currently obsessed with?",
    "What's your hot take on something totally mundane?",
  ],
} satisfies ServerMessages;

const es = {
  push: {
    titleForHandle: (handle: string) => `Nueva pregunta para @${handle}`,
    titleAnonymous: "Nueva pregunta anónima",
    body: `¡Alguien te envió una pregunta anónima en ${APP_NAME}!`,
  },
  exampleQuestions: [
    "¿Te gustan los gatos?",
    "¿Te gustan los perros?",
    "¿Cuál es tu película favorita?",
    "Si pudieras viajar a cualquier lugar, ¿a dónde irías?",
    "¿Qué es lo que la mayoría de la gente no sabe de ti?",
    "¿Cuál es el mejor consejo que has recibido?",
    "¿Cuál es tu obsesión del momento?",
    "¿Cuál es tu opinión más controvertida sobre algo totalmente cotidiano?",
  ],
} satisfies ServerMessages;

const pt = {
  push: {
    titleForHandle: (handle: string) => `Nova pergunta para @${handle}`,
    titleAnonymous: "Nova pergunta anônima",
    body: `Alguém te enviou uma pergunta anônima no ${APP_NAME}!`,
  },
  exampleQuestions: [
    "Você gosta de gatos?",
    "Você gosta de cachorros?",
    "Qual é o seu filme favorito?",
    "Se você pudesse viajar para qualquer lugar, para onde iria?",
    "O que a maioria das pessoas não sabe sobre você?",
    "Qual é o melhor conselho que você já recebeu?",
    "Qual é a sua obsessão do momento?",
    "Qual é a sua opinião impopular sobre algo totalmente banal?",
  ],
} satisfies ServerMessages;

const de = {
  push: {
    titleForHandle: (handle: string) => `Neue Frage für @${handle}`,
    titleAnonymous: "Neue anonyme Frage",
    body: `Jemand hat dir eine anonyme Frage auf ${APP_NAME} geschickt!`,
  },
  exampleQuestions: [
    "Magst du Katzen?",
    "Magst du Hunde?",
    "Was ist dein Lieblingsfilm?",
    "Wenn du überallhin reisen könntest, wohin würdest du gehen?",
    "Was wissen die meisten Leute nicht über dich?",
    "Was ist der beste Rat, den du je bekommen hast?",
    "Wovon bist du gerade besessen?",
    "Was ist deine unpopuläre Meinung zu etwas völlig Alltäglichem?",
  ],
} satisfies ServerMessages;

const fr = {
  push: {
    titleForHandle: (handle: string) => `Nouvelle question pour @${handle}`,
    titleAnonymous: "Nouvelle question anonyme",
    body: `Quelqu'un t'a envoyé une question anonyme sur ${APP_NAME} !`,
  },
  exampleQuestions: [
    "Tu aimes les chats ?",
    "Tu aimes les chiens ?",
    "Quel est ton film préféré ?",
    "Si tu pouvais voyager n'importe où, où irais-tu ?",
    "Qu'est-ce que la plupart des gens ne savent pas sur toi ?",
    "Quel est le meilleur conseil qu'on t'ait jamais donné ?",
    "Quelle est ton obsession du moment ?",
    "Quel est ton avis impopulaire sur un sujet totalement banal ?",
  ],
} satisfies ServerMessages;

const CATALOGS: Record<ServerLocale, ServerMessages> = { en, es, pt, de, fr };

/** The lowercased primary subtag: `es-419` and `ES` both reduce to `es`. */
function primarySubtag(tag: string): string {
  return tag.split("-")[0].toLowerCase();
}

/**
 * Whether `value` is a well-formed BCP-47 tag with a catalog. Run before
 * persisting, so every reader (this module, client `Intl`, the Go OG service)
 * accepts what is stored.
 *
 * @see [i18n.test.ts](../tests/i18n.test.ts) — pins the regional-variant,
 * malformed-tag, and unsupported-language cases.
 */
export function isSupportedLocaleTag(value: string): boolean {
  try {
    Intl.getCanonicalLocales(value);
  } catch {
    return false;
  }
  return Object.hasOwn(CATALOGS, primarySubtag(value));
}

/**
 * Falls back to `en` for an unset or unsupported locale; matches the primary
 * subtag. Never throws. `Object.hasOwn`, not `in`, so `toString` or
 * `__proto__` cannot return a prototype member.
 *
 * @see [i18n.test.ts](../tests/i18n.test.ts) — pins the prototype-key and
 * regional-variant cases alongside the plain fallback.
 */
export function getServerMessages(locale: string | null | undefined): ServerMessages {
  if (!locale) return CATALOGS.en;
  const primary = primarySubtag(locale);
  if (Object.hasOwn(CATALOGS, primary)) {
    return CATALOGS[primary as ServerLocale];
  }
  return CATALOGS.en;
}
