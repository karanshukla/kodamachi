import { renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { APP_NAME } from "../../lib/brand";

const SITE_TITLE = "the site title";

describe("usePageTitle", () => {
  let usePageTitle: (page?: string) => void;

  beforeAll(async () => {
    document.title = SITE_TITLE;
    ({ usePageTitle } = await import("../../lib/usePageTitle"));
  });

  it("names the page ahead of the app", () => {
    renderHook(() => usePageTitle("Messages"));
    expect(document.title).toBe(`Messages · ${APP_NAME}`);
  });

  it("puts the site title back on a page with no name of its own", () => {
    renderHook(() => usePageTitle("Settings"));
    renderHook(() => usePageTitle());
    expect(document.title).toBe(SITE_TITLE);
  });
});
