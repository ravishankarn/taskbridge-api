import { and, asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './project.model';
import { ProjectSchema, projectsTable, type Project } from './project.model';

type ProjectRow = typeof projectsTable.$inferSelect;
type ProjectsDb = BetterSQLite3Database<typeof schema>;

function toProject(row: ProjectRow): Project {
  return ProjectSchema.parse({
    ...row,
    description: row.description ?? undefined,
  });
}

/** Persistence layer for projects; every query is tenant-scoped via the ORM query builder. */
export class ProjectRepository {
  constructor(private readonly db: ProjectsDb) {}

  insert(project: Project): Project {
    this.db.insert(projectsTable).values(project).run();
    return project;
  }

  findById(tenantId: string, id: string): Project | undefined {
    const row = this.db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, id)))
      .get();
    return row ? toProject(row) : undefined;
  }

  findByTeam(tenantId: string, teamId: string): Project[] {
    const rows = this.db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.teamId, teamId)))
      .orderBy(asc(projectsTable.createdAt))
      .all();
    return rows.map(toProject);
  }

  updateStatus(tenantId: string, id: string, status: string, updatedAt: string): number {
    const result = this.db
      .update(projectsTable)
      .set({ status, updatedAt })
      .where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, id)))
      .run();
    return result.changes;
  }

  delete(tenantId: string, id: string): number {
    const result = this.db
      .delete(projectsTable)
      .where(and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, id)))
      .run();
    return result.changes;
  }
}
