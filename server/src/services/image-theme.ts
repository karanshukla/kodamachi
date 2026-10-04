import { type Database } from "../database/db";

export const DEFAULT_IMAGE_THEME = "default";

/** Shared by the reply path and render pipeline so a render is keyed and posted under one theme. */
export async function readImageTheme(db: Database, did: string): Promise<string> {
  const userSettings = await db
    .selectFrom("user_settings")
    .selectAll()
    .where("did", "=", did)
    .executeTakeFirst();
  return userSettings?.imageTheme ?? DEFAULT_IMAGE_THEME;
}
