import type Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './project.model';

/** Owns schema migration for the projects table; DDL only, all queries go through the ORM. */
export function migrateProjectsSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      teamId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      ownerId TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_tenant_team_idx ON projects (tenantId, teamId);
  `);
}

export function createProjectsDb(sqlite: Database.Database): BetterSQLite3Database<typeof schema> {
  migrateProjectsSchema(sqlite);
  return drizzle(sqlite, { schema });
}
