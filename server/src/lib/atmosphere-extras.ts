/**
 * Atmosphere apps the Aturi catalog does not carry (it lists clients, not apps).
 *
 * An entry needs a profile page that exists and renders the account: teal.fm
 * (pre-launch) and Statusphere (redirects to GitHub) are deliberately absent.
 *
 * @see [atmosphere-service.test.ts](../tests/atmosphere-service.test.ts):
 * "finds an app the Aturi catalog has never heard of".
 */
export interface ExtraApp {
  id: string;
  name: string;
  collectionPrefixes: string[];
  profileUrl: (handle: string) => string;
}

export const EXTRA_APPS: readonly ExtraApp[] = [
  {
    id: "rocksky",
    name: "Rocksky",
    collectionPrefixes: ["app.rocksky."],
    profileUrl: (handle) => `https://rocksky.app/profile/${handle}`,
  },
];
