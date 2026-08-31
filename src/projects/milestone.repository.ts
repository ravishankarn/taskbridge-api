import { and, asc, eq } from 'drizzle-orm';
import type { ProjectsDb } from './project.database';
import { MilestoneSchema, milestonesTable, type Milestone } from './milestone.model';

type MilestoneRow = typeof milestonesTable.$inferSelect;
type MilestoneMutableFields = Partial<Pick<Milestone, 'title' | 'description' | 'dueDate' | 'status'>>;

function toMilestone(row: MilestoneRow): Milestone {
  return MilestoneSchema.parse({
    ...row,
    description: row.description ?? undefined,
    dueDate: row.dueDate ?? undefined,
  });
}

/** Persistence layer for milestones; every query is tenant- and project-scoped via the ORM query builder. */
export class MilestoneRepository {
  constructor(private readonly db: ProjectsDb) {}

  insert(milestone: Milestone): Milestone {
    this.db.insert(milestonesTable).values(milestone).run();
    return milestone;
  }

  findById(tenantId: string, projectId: string, id: string): Milestone | undefined {
    const row = this.db
      .select()
      .from(milestonesTable)
      .where(
        and(
          eq(milestonesTable.tenantId, tenantId),
          eq(milestonesTable.projectId, projectId),
          eq(milestonesTable.id, id),
        ),
      )
      .get();
    return row ? toMilestone(row) : undefined;
  }

  findByProject(tenantId: string, projectId: string): Milestone[] {
    const rows = this.db
      .select()
      .from(milestonesTable)
      .where(and(eq(milestonesTable.tenantId, tenantId), eq(milestonesTable.projectId, projectId)))
      .orderBy(asc(milestonesTable.createdAt))
      .all();
    return rows.map(toMilestone);
  }

  update(
    tenantId: string,
    projectId: string,
    id: string,
    fields: MilestoneMutableFields,
    updatedAt: string,
  ): number {
    const result = this.db
      .update(milestonesTable)
      .set({ ...fields, updatedAt })
      .where(
        and(
          eq(milestonesTable.tenantId, tenantId),
          eq(milestonesTable.projectId, projectId),
          eq(milestonesTable.id, id),
        ),
      )
      .run();
    return result.changes;
  }
}
