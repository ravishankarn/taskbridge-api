import type Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as milestoneOutboxSchema from './milestone-outbox.model';
import * as milestoneSchema from './milestone.model';
import * as projectMemberSchema from './project-member.model';
import * as projectSchema from './project.model';

const schema = {
  ...projectSchema,
  ...milestoneSchema,
  ...milestoneOutboxSchema,
  ...projectMemberSchema,
};

export type ProjectsDb = BetterSQLite3Database<typeof schema>;

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

/** Owns schema migration for the milestones table. */
export function migrateMilestonesSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      projectId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      dueDate TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS milestones_tenant_project_idx ON milestones (tenantId, projectId);
  `);
}

/** Owns schema migration for the milestone transactional outbox table. */
export function migrateMilestoneOutboxSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS milestone_outbox_events (
      eventId TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      projectId TEXT NOT NULL,
      milestoneId TEXT NOT NULL,
      actorId TEXT NOT NULL,
      occurredAt TEXT NOT NULL,
      beforeState TEXT,
      afterState TEXT,
      changedFields TEXT NOT NULL,
      metadata TEXT NOT NULL,
      publishedAt TEXT,
      attemptCount INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS milestone_outbox_publish_idx ON milestone_outbox_events (publishedAt);
    CREATE INDEX IF NOT EXISTS milestone_outbox_tenant_idx ON milestone_outbox_events (tenantId, occurredAt);
  `);
}

/** Owns schema migration for the project membership table. */
export function migrateProjectMembersSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_members (
      projectId TEXT NOT NULL,
      tenantId TEXT NOT NULL,
      userId TEXT NOT NULL,
      channels TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (projectId, userId)
    );
    CREATE INDEX IF NOT EXISTS project_members_tenant_idx ON project_members (tenantId, projectId);
  `);
}

/** Runs all projects-service migrations; DDL only, all queries go through the ORM. */
export function migrateAllSchemas(sqlite: Database.Database): void {
  migrateProjectsSchema(sqlite);
  migrateMilestonesSchema(sqlite);
  migrateMilestoneOutboxSchema(sqlite);
  migrateProjectMembersSchema(sqlite);
}

export function createProjectsDb(sqlite: Database.Database): ProjectsDb {
  migrateAllSchemas(sqlite);
  return drizzle(sqlite, { schema });
}
