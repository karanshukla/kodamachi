import { Kysely } from "kysely";
import type { Migration, MigrationProvider } from "kysely/migration";

import type { Migration005Schema } from "./schema";

/**
 * Applied in key order at startup by `migrateToLatest()` (`./db.ts`). Add a new
 * one as the next numbered key; never edit a key that has already shipped.
 */
const migrations: Record<string, Migration> = {};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

migrations["001"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("status")
      .addColumn("uri", "varchar", (col) => col.primaryKey())
      .addColumn("authorDid", "varchar", (col) => col.notNull())
      .addColumn("status", "varchar", (col) => col.notNull())
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .addColumn("indexedAt", "varchar", (col) => col.notNull())
      .execute();
    await db.schema
      .createTable("auth_session")
      .addColumn("key", "varchar", (col) => col.primaryKey())
      .addColumn("session", "varchar", (col) => col.notNull())
      .execute();
    await db.schema
      .createTable("auth_state")
      .addColumn("key", "varchar", (col) => col.primaryKey())
      .addColumn("state", "varchar", (col) => col.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("auth_state").execute();
    await db.schema.dropTable("auth_session").execute();
    await db.schema.dropTable("status").execute();
  },
};

migrations["002"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("message")
      .addColumn("tid", "varchar", (col) => col.primaryKey())
      .addColumn("message", "varchar", (col) => col.notNull())
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .addColumn("recipient", "varchar", (col) => col.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("message").execute();
  },
};

migrations["003"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("user_profile")
      .addColumn("did", "varchar", (col) => col.primaryKey())
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("user_profile").execute();
  },
};

migrations["004"] = {
  async up(db: Kysely<unknown>) {
    await db.schema.dropTable("status").ifExists().execute();
    await db.schema.dropTable("sessions").ifExists().execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema
      .createTable("status")
      .addColumn("uri", "varchar", (col) => col.primaryKey())
      .addColumn("authorDid", "varchar", (col) => col.notNull())
      .addColumn("status", "varchar", (col) => col.notNull())
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .addColumn("indexedAt", "varchar", (col) => col.notNull())
      .execute();
    await db.schema
      .createTable("sessions")
      .addColumn("sid", "varchar", (col) => col.primaryKey())
      .addColumn("sess", "varchar", (col) => col.notNull())
      .addColumn("expire", "varchar", (col) => col.notNull())
      .execute();
  },
};

migrations["005"] = {
  async up(db: Kysely<Migration005Schema>) {
    await db.schema
      .createTable("user_settings")
      .addColumn("did", "varchar", (col) => col.primaryKey())
      .addColumn("pdsSyncEnabled", "boolean", (col) => col.notNull().defaultTo(true))
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .execute();

    await db
      .insertInto("user_settings")
      .columns(["did", "createdAt"])
      .expression((eb) =>
        eb.selectFrom("user_profile").select(["user_profile.did", "user_profile.createdAt"])
      )
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("user_settings").ifExists().execute();
  },
};

migrations["006"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable("user_settings")
      .addColumn("imageTheme", "varchar", (col) => col.notNull().defaultTo("default"))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable("user_settings").dropColumn("imageTheme").execute();
  },
};

migrations["007"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("push_subscription")
      .addColumn("id", "serial", (col) => col.primaryKey())
      .addColumn("did", "varchar", (col) => col.notNull())
      .addColumn("endpoint", "varchar", (col) => col.notNull().unique())
      .addColumn("p256dh", "varchar", (col) => col.notNull())
      .addColumn("auth", "varchar", (col) => col.notNull())
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .execute();
    await db.schema
      .createIndex("push_subscription_did_idx")
      .on("push_subscription")
      .column("did")
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex("push_subscription_did_idx").execute();
    await db.schema.dropTable("push_subscription").ifExists().execute();
  },
};

migrations["008"] = {
  async up(db: Kysely<unknown>) {
    // SQLite cannot ALTER a constraint, so the table is rebuilt. Existing
    // subscriptions go with it; re-enabling notifications is a one-tap fix.
    await db.schema.dropIndex("push_subscription_did_idx").ifExists().execute();
    await db.schema.dropTable("push_subscription").ifExists().execute();

    await db.schema
      .createTable("push_subscription")
      .addColumn("id", "serial", (col) => col.primaryKey())
      .addColumn("did", "varchar", (col) => col.notNull())
      .addColumn("endpoint", "varchar", (col) => col.notNull())
      .addColumn("p256dh", "varchar", (col) => col.notNull())
      .addColumn("auth", "varchar", (col) => col.notNull())
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .addUniqueConstraint("push_subscription_did_endpoint_unique", ["did", "endpoint"])
      .execute();

    await db.schema
      .createIndex("push_subscription_did_idx")
      .on("push_subscription")
      .column("did")
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex("push_subscription_did_idx").ifExists().execute();
    await db.schema.dropTable("push_subscription").ifExists().execute();

    await db.schema
      .createTable("push_subscription")
      .addColumn("id", "serial", (col) => col.primaryKey())
      .addColumn("did", "varchar", (col) => col.notNull())
      .addColumn("endpoint", "varchar", (col) => col.notNull().unique())
      .addColumn("p256dh", "varchar", (col) => col.notNull())
      .addColumn("auth", "varchar", (col) => col.notNull())
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex("push_subscription_did_idx")
      .on("push_subscription")
      .column("did")
      .execute();
  },
};

migrations["009"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable("user_settings")
      .addColumn("inboxEnabled", "boolean", (col) => col.notNull().defaultTo(true))
      .execute();
    await db.schema
      .alterTable("user_settings")
      .addColumn("profanityFilterEnabled", "boolean", (col) => col.notNull().defaultTo(false))
      .execute();
    await db.schema.alterTable("user_settings").addColumn("customPrompt", "varchar").execute();
    await db.schema.alterTable("user_settings").addColumn("profileCardTheme", "varchar").execute();
    await db.schema.alterTable("user_settings").addColumn("touchpointLocale", "varchar").execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable("user_settings").dropColumn("touchpointLocale").execute();
    await db.schema.alterTable("user_settings").dropColumn("profileCardTheme").execute();
    await db.schema.alterTable("user_settings").dropColumn("customPrompt").execute();
    await db.schema.alterTable("user_settings").dropColumn("profanityFilterEnabled").execute();
    await db.schema.alterTable("user_settings").dropColumn("inboxEnabled").execute();
  },
};

migrations["010"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createIndex("message_recipient_idx")
      .on("message")
      .column("recipient")
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex("message_recipient_idx").execute();
  },
};

migrations["011"] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable("user_settings").addColumn("uiLocale", "varchar").execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable("user_settings").dropColumn("uiLocale").execute();
  },
};

migrations["012"] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable("user_settings").addColumn("defaultClient", "varchar").execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable("user_settings").dropColumn("defaultClient").execute();
  },
};

// Added with a default rather than as a nullable column: every existing row has
// to read as "on", and the client's `on()` reads a NULL as false.
migrations["013"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable("user_settings")
      .addColumn("openProfilesInApp", "integer", (col) => col.defaultTo(1))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable("user_settings").dropColumn("openProfilesInApp").execute();
  },
};

// Default-on like 013, and for the same reason: the column has to read as "on"
// for every row that predates it. Unlike 013 this one is the profile owner's
// setting rather than the viewer's, so it is public — see
// `profile-service.ts`'s `readPubliclyVisibleSettings`.
migrations["014"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable("user_settings")
      .addColumn("atmosphereLinksEnabled", "integer", (col) => col.defaultTo(1))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable("user_settings").dropColumn("atmosphereLinksEnabled").execute();
  },
};
