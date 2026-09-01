import { and, asc, eq } from 'drizzle-orm';
import { ProjectSchema, projectsTable, type Project } from './project.model';
import type { ProjectsDb } from './project.database';

type ProjectRow = typeof projectsTable.$inferSelect;

function toProject(row: ProjectRow): Project {
  return ProjectSchema.parse({
    ...row,
    description: row.description ?? undefined,
  });
}

/** Persistence layer for projects; every query is tenant-scoped via the ORM query builder. */
export class ProjectRepository {
  constructor(private readonly db: ProjectsDb) {}

  /** Inserts a fully-validated project row and returns it unchanged. */
  insert(project: Project): Project {
    this.db.insert(projectsTable).values(project).run();
    return project;
  }

  /** Looks up a project by ID scoped to `tenantId`; returns `undefined` if absent or owned by another tenant. */
  findById(tenantId: string, id: string): Project | undefined {
    const row = this.db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, id)))
      .get();
    return row ? toProject(row) : undefined;
  }

  /** Lists a tenant's projects for a team, oldest first. */
  findByTeam(tenantId: string, teamId: string): Project[] {
    const rows = this.db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.teamId, teamId)))
      .orderBy(asc(projectsTable.createdAt))
      .all();
    return rows.map(toProject);
  }

  /** Updates status/updatedAt for a tenant-owned project; returns the number of rows changed (0 if not found). */
  updateStatus(tenantId: string, id: string, status: string, updatedAt: string): number {
    const result = this.db
      .update(projectsTable)
      .set({ status, updatedAt })
      .where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, id)))
      .run();
    return result.changes;
  }

  /** Deletes a tenant-owned project; returns the number of rows changed (0 if not found). */
  delete(tenantId: string, id: string): number {
    const result = this.db
      .delete(projectsTable)
      .where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, id)))
      .run();
    return result.changes;
  }
}
