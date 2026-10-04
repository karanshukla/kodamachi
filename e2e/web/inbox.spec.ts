import { test, expect, type Page } from "@playwright/test";

import { en } from "../../client/src/lib/i18n/en";
import { escapeRegex } from "../helpers/i18n";
import { flipSettingsSwitch, settingsSwitch } from "../helpers/settings-switch";

test.use({ storageState: "e2e/.auth/user.json" });

// Reply buttons render either "Reply" or "Reply to thread"; anchored on the
// shorter catalog string so the match tracks either rendered form.
const replyButtonName = new RegExp(`^${escapeRegex(en.replyComposer.reply)}`);

// Replying would post a permanent Bluesky post, so that test backs out with Escape.
// The account is shared with other specs: no test may assume it owns the inbox.

test.beforeEach(async ({ page }) => {
  await page.goto("/messages");
  await expect(page).toHaveURL(/\/messages/);
  await expect(
    page.getByRole("heading", { name: en.messagesPage.heading, exact: true })
  ).toBeVisible({
    timeout: 10_000,
  });
});

test("inbox renders the header and inbox-link hero card", async ({ page }) => {
  await expect(page.getByText(en.inboxLinkCard.eyebrow)).toBeVisible({ timeout: 10_000 });
});

test("expand a message card to reveal the reply composer and back out", async ({ page }) => {
  const seeded = await ensureExampleMessages(page);

  const card = page.locator('[id^="message-card-"]').first();
  await expect(card).toBeVisible({ timeout: 10_000 });

  await card.click();

  const replyBox = page.getByLabel(en.replyComposer.responseAriaLabel);
  await expect(replyBox).toBeVisible({ timeout: 5_000 });
  await replyBox.fill("an e2e draft reply");

  const replyBtn = page.getByRole("button", { name: replyButtonName }).last();
  await expect(replyBtn).toBeEnabled({ timeout: 5_000 });

  // Escape collapses the composer without posting to Bluesky.
  await replyBox.press("Escape");
  await expect(replyBox).toHaveCount(0);

  if (seeded) await cleanupAllMessages(page);
});

test("pin and unpin a thread root is local state only", async ({ page }) => {
  const seeded = await ensureExampleMessages(page);

  const card = page.locator('[id^="message-card-"]').first();
  await expect(card).toBeVisible({ timeout: 10_000 });

  await card.getByRole("button", { name: en.questionCard.setAsThreadRootLabel }).click();
  await expect(
    card.getByRole("button", { name: en.questionCard.unpinThreadRootLabel })
  ).toBeVisible({
    timeout: 5_000,
  });

  await card.getByRole("button", { name: en.questionCard.unpinThreadRootLabel }).click();
  await expect(
    card.getByRole("button", { name: en.questionCard.setAsThreadRootLabel })
  ).toBeVisible({
    timeout: 5_000,
  });

  if (seeded) await cleanupAllMessages(page);
});

test("posting-preferences switch toggles state", async ({ page }) => {
  const seeded = await ensureExampleMessages(page);

  // The switches live in the preferences bar's popover, not on the page.
  await page.getByRole("button", { name: en.preferencesBar.open }).click();
  const autoScroll = settingsSwitch(page, en.postingPreferences.autoScrollToMessages.label);
  await expect(autoScroll).toBeVisible({ timeout: 5_000 });

  const before = await autoScroll.isChecked();
  await flipSettingsSwitch(autoScroll);
  if (before) {
    await expect(autoScroll).not.toBeChecked({ timeout: 5_000 });
  } else {
    await expect(autoScroll).toBeChecked({ timeout: 5_000 });
  }

  if (seeded) await cleanupAllMessages(page);
});

test("delete a message removes it from the inbox (no-confirm default)", async ({ page }) => {
  // Seeds its own marker row: skipping on a populated inbox once let this pass
  // without exercising delete.
  const marker = `[e2e inbox-delete ${Date.now()}]`;
  await seedOwnedMessage(page, marker);
  try {
    // The row was seeded after navigation; reload past React Query's cache.
    await page.reload();
    const card = page.locator('[id^="message-card-"]').filter({ hasText: marker });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole("button", { name: en.questionCard.deleteMessageLabel }).click();

    await expect(card).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await deleteMessagesByText(page, [marker]);
  }
});

/**
 * Ensure the inbox has at least one message. If it's empty, click "Add example
 * messages" (local-DB-only seeding). Returns true if this call seeded the inbox
 * (and thus cleanup is warranted), false if it was already populated.
 */
async function ensureExampleMessages(page: Page): Promise<boolean> {
  await expect(page.locator("main, [role=main]")).toBeVisible({ timeout: 10_000 });

  // Neither is present while loading, so this waits for the query to settle.
  const cards = page.locator('[id^="message-card-"]');
  const addExamples = page.getByRole("button", { name: en.messagesPage.addExampleMessages });
  await expect(async () => {
    const hasCards = (await cards.count()) > 0;
    const hasEmpty = await addExamples.isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBeTruthy();
  }).toPass({ timeout: 15_000 });

  if ((await cards.count()) > 0) return false; // already populated — don't touch it

  await addExamples.click();
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  return true;
}

/** Best-effort deletion of all inbox messages via the API. */
async function cleanupAllMessages(page: Page) {
  try {
    const session = await page.request.get("/api/session");
    const { did } = await session.json();
    if (!did) return;
    const res = await page.request.get(`/api/messages/${encodeURIComponent(did)}`);
    if (!res.ok()) return;
    const { messages }: { messages: { tid: string }[] } = await res.json();
    await Promise.all(
      messages.map((m) => page.request.delete(`/api/messages/${encodeURIComponent(m.tid)}`))
    );
  } catch {
    // best-effort
  }
}

/**
 * Seeds a message identified by `marker` via `POST /messages/send`, so it is
 * deletable by tid and leaves no PDS record. The caller must make the card
 * visible (e.g. `page.reload()`) before asserting on it.
 */
async function seedOwnedMessage(page: Page, marker: string): Promise<void> {
  const session = await page.request.get("/api/session");
  const { did } = await session.json();
  if (!did) throw new Error("seedOwnedMessage: no session.did");
  const text = `${marker} owned by inbox delete test`;
  const res = await page.request.post("/api/messages/send", {
    data: { recipient: did, message: text },
  });
  if (!res.ok()) {
    throw new Error(`seedOwnedMessage: /messages/send failed (${res.status()})`);
  }
}

/**
 * Best-effort deletion of inbox messages whose body contains one of `needles`.
 * Used to clean up marker'd rows a test created via {@link seedOwnedMessage}
 * if the UI path under test didn't remove them.
 */
async function deleteMessagesByText(page: Page, needles: string[]): Promise<void> {
  try {
    const session = await page.request.get("/api/session");
    if (!session.ok()) return;
    const { did } = await session.json();
    if (!did) return;
    const res = await page.request.get(`/api/messages/${encodeURIComponent(did)}`);
    if (!res.ok()) return;
    const { messages }: { messages: { tid: string; message: string }[] } = await res.json();
    await Promise.all(
      messages
        .filter((m) => needles.some((n) => m.message.includes(n)))
        .map((m) => page.request.delete(`/api/messages/${encodeURIComponent(m.tid)}`))
    );
  } catch {
    // best-effort
  }
}
