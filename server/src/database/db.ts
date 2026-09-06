import { Kysely, SqliteDialect, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import { Pool } from "pg";

import { env } from "#/lib/env";
import { BunSqliteDatabase } from "./bun-sqlite-dialect";
import { migrationProvider } from "./migrations";
import type { Database, DatabaseSchema } from "./schema";

export type { Database, DatabaseSchema } from "./schema";

export const createDb = async (location: string): Promise<Database> => {
  if (env.POSTGRESQL_URL) {
    // statement_timeout is applied per-connection via the `options` parameter
    // (libpq's runtime options string), so every pooled connection inherits it
    // without a round-trip per checkout. An empty string leaves it unset.
    const statementTimeout = env.PG_STATEMENT_TIMEOUT_MS;
    const poolConfig: { [key: string]: unknown } = {
      connectionString: env.POSTGRESQL_URL,
      max: env.PG_POOL_MAX,
      idleTimeoutMillis: env.PG_POOL_IDLE_TIMEOUT_MS,
    };
    if (statementTimeout > 0) {
      poolConfig.options = `-c statement_timeout=${statementTimeout}`;
    }
    return new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({
        pool: new Pool(poolConfig),
      }),
    });
  }
  const { Database: BunSqlite } = await import("bun:sqlite");
  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: new BunSqliteDatabase(new BunSqlite(location)),
    }),
  });
};

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
};
