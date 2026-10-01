import { useDocumentTitle } from "@mantine/hooks";

import { APP_NAME } from "./brand";

const SITE_TITLE = document.title;

export function usePageTitle(page?: string) {
  useDocumentTitle(page ? `${page} · ${APP_NAME}` : SITE_TITLE);
}
