/**
 * SQLite stores booleans as 0/1, Postgres as booleans: a Kysely read can be
 * either at runtime whatever the row type says.
 *
 * @see [db-boolean.test.ts](../tests/db-boolean.test.ts) — pins both shapes.
 */
export function fromDbBoolean(value: unknown, whenMissing: boolean): boolean {
  if (value === undefined || value === null) return whenMissing;
  return value !== 0 && value !== false;
}

export function toDbBoolean(value: boolean): number {
  return value ? 1 : 0;
}
