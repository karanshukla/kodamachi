import type { Generated, Kysely } from "kysely";

export type DatabaseSchema = {
  status: Status;
  auth_session: AuthSession;
  auth_state: AuthState;
  message: Message;
  user_profile: UserProfile;
  sessions: Sessions;
  user_settings: UserSettings;
  push_subscription: PushSubscription;
};

/** @deprecated Dropped by migration 004; the type remains only for `down()`. */
export type Status = {
  uri: string;
  authorDid: string;
  status: string;
  createdAt: string;
  indexedAt: string;
};

export type AuthSession = {
  key: string;
  session: AuthSessionJson;
};

export type AuthState = {
  key: string;
  state: AuthStateJson;
};

export type Message = {
  tid: string;
  message: string;
  createdAt: string;
  recipient: string;
};

export type UserProfile = {
  did: string;
  createdAt: string;
};

/** Boolean columns are read/written through `lib/db-boolean`, not directly. */
export type UserSettings = {
  did: string;
  pdsSyncEnabled: number;
  imageTheme: string;
  inboxEnabled: number;
  profanityFilterEnabled: number;
  customPrompt: string | null;
  profileCardTheme: string | null;
  touchpointLocale: string | null;
  uiLocale: string | null;
  defaultClient: string | null;
  openProfilesInApp: number;
  atmosphereLinksEnabled: number;
  createdAt: string;
};

/** @deprecated Dropped by migration 004; the type remains only for `down()`. */
export type Sessions = {
  sid: string;
  sess: string;
  expire: string;
};

/** One row per (browser/device, account) pair — see `push_subscription_did_endpoint_unique`. */
export type PushSubscription = {
  id: Generated<number>;
  did: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
};

type AuthStateJson = string;

type AuthSessionJson = string;

/** The two tables migration 005 touches, as they stood when it was written. */
export type Migration005Schema = {
  user_profile: { did: string; createdAt: string };
  user_settings: { did: string; createdAt: string };
};

export type Database = Kysely<DatabaseSchema>;
