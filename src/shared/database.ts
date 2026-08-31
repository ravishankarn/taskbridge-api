import type Database from 'better-sqlite3';

/** Runs fn atomically on the given connection; better-sqlite3 rolls back automatically on throw. */
export function withTransaction<T>(sqlite: Database.Database, fn: () => T): T {
  return sqlite.transaction(fn)();
}
