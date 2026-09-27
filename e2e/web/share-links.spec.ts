import { test, expect } from "@playwright/test";

import { en } from "../../client/src/lib/i18n/en";

test.use({ storageState: "e2e/.auth/user.json" });

const handle = () => {
  const h = process.env.E2E_HANDLE;
  if (!h) throw new Error("E2E_HANDLE must be set");
  return h;
};

// Spelled out rather than read from brand.json, so moving the share domain
// fails here instead of silently following.
const SHARE_DOMAIN = "kodamachi.online";

test("public profile hands out a kodamachi.online link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const h = handle();
  await page.goto(`/profile/${h}`);

  await expect(page.getByText(`${SHARE_DOMAIN}/${h}`, { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await page
    .getByRole("button", { name: en.profileUrlBar.copyProfileLinkAriaLabel, exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`https://${SHARE_DOMAIN}/${h}`);
});
