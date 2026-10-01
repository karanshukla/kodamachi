// Scoped here, not tsconfig `types`, so the Bun global doesn't leak project-wide.
// Must stay above the imports or it is treated as a plain comment.
/// <reference types="bun" />

// bun:sqlite differs from Kysely's duck-typed surface by no `reader` flag and variadic params.
interface KyselySqliteStatement {
  reader: boolean;
  all(parameters: ReadonlyArray<unknown>): unknown[];
  run(parameters: ReadonlyArray<unknown>): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown>;
}
interface KyselySqliteDatabase {
  close(): void;
  prepare(sql: string): KyselySqliteStatement;
}

class BunSqliteStatement implements KyselySqliteStatement {
  readonly reader: boolean;
  #stmt: import("bun:sqlite").Statement;

  constructor(stmt: import("bun:sqlite").Statement) {
    this.#stmt = stmt;
    this.reader = stmt.columnNames.length > 0;
  }

  all(parameters: ReadonlyArray<unknown>) {
    return this.#stmt.all(...parameters);
  }

  run(parameters: ReadonlyArray<unknown>) {
    return this.#stmt.run(...parameters);
  }

  iterate(parameters: ReadonlyArray<unknown>) {
    return this.#stmt.iterate(...parameters);
  }
}

export class BunSqliteDatabase implements KyselySqliteDatabase {
  #db: import("bun:sqlite").Database;

  constructor(db: import("bun:sqlite").Database) {
    this.#db = db;
  }

  prepare(sql: string) {
    return new BunSqliteStatement(this.#db.prepare(sql));
  }

  close() {
    this.#db.close();
  }
}
