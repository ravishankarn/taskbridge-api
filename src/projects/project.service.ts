/**
 * INHERITED / AI-GENERATED CODE — UNREVIEWED.
 *
 * This file was inherited from an upstream AI-assisted contribution and has NOT undergone
 * architecture or security review. Do not treat it as a vetted reference pattern, and do not
 * refactor/"clean up" it silently — see .github/copilot-instructions.md.
 * TODO(security-review): full architecture and security review pending.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  type CreateProjectInput,
  type Project,
  type ProjectStatus,
  ProjectSchema,
  ProjectStatusSchema,
} from './project.model';

export class ProjectService {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(`
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

  create(input: CreateProjectInput): Project {
    const now = new Date().toISOString();
    const project: Project = ProjectSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      teamId: input.teamId,
      name: input.name,
      description: input.description,
      ownerId: input.ownerId,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    });

    this.db
      .prepare(
        `INSERT INTO projects
          (id, tenantId, teamId, name, description, ownerId, status, createdAt, updatedAt)
         VALUES
          (@id, @tenantId, @teamId, @name, @description, @ownerId, @status, @createdAt, @updatedAt)`,
      )
      .run(project);

    return project;
  }

  findById(tenantId: string, id: string): Project | undefined {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE tenantId = ? AND id = ?')
      .get(tenantId, id);
    return row ? ProjectSchema.parse(row) : undefined;
  }

  getByTeam(tenantId: string, teamId: string): Project[] {
    const rows = this.db
      .prepare('SELECT * FROM projects WHERE tenantId = ? AND teamId = ? ORDER BY createdAt ASC')
      .all(tenantId, teamId);
    return rows.map((row) => ProjectSchema.parse(row));
  }

  updateStatus(tenantId: string, id: string, status: ProjectStatus): Project | undefined {
    const validStatus = ProjectStatusSchema.parse(status);
    const updatedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE projects
         SET status = ?, updatedAt = ?
         WHERE tenantId = ? AND id = ?`,
      )
      .run(validStatus, updatedAt, tenantId, id);

    return result.changes > 0 ? this.findById(tenantId, id) : undefined;
  }

  delete(tenantId: string, id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM projects WHERE tenantId = ? AND id = ?')
      .run(tenantId, id);
    return result.changes > 0;
  }
}
