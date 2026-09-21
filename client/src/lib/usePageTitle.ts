import { useDocumentTitle } from "@mantine/hooks";

import { APP_NAME } from "./brand";

const SITE_TITLE = document.title;

/** Names the page in the tab and to screen readers; with no page, the site's own title. */
export function usePageTitle(page?: string) {
  useDocumentTitle(page ? `${page} · ${APP_NAME}` : SITE_TITLE);
}
