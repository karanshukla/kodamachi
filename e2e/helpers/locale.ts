import type { Page } from "@playwright/test";

/**
 * Literal copy of `STORAGE_PREFIX` ("navyfragen", client/src/lib/contracts.ts) plus the
 * `_ui_locale` suffix, so a rename there fails here instead of silently following.
 */
const UI_LOCALE_STORAGE_KEY = "navyfragen_ui_locale";

/**
 * Seeds `uiLocale` into localStorage before any app script runs, so a
 * logged-out page load resolves a known locale instead of falling through to
 * `navigator.languages`. Call before the first `page.goto`.
 */
export async function seedUiLocale(page: Page, locale = "en"): Promise<void> {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    UI_LOCALE_STORAGE_KEY,
    JSON.stringify(locale),
  ] as [string, string]);
}
