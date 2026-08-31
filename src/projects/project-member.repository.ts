import { and, eq } from 'drizzle-orm';
import type { ProjectsDb } from './project.database';
import { ProjectMemberSchema, projectMembersTable, type ProjectMember } from './project-member.model';

type ProjectMemberRow = typeof projectMembersTable.$inferSelect;

function toMember(row: ProjectMemberRow): ProjectMember {
  return ProjectMemberSchema.parse({
    ...row,
    channels: JSON.parse(row.channels) as unknown,
  });
}

/** Persistence layer for project membership; every query is tenant- and project-scoped. */
export class ProjectMemberRepository {
  constructor(private readonly db: ProjectsDb) {}

  upsert(member: ProjectMember): ProjectMember {
    this.db
      .insert(projectMembersTable)
      .values({ ...member, channels: JSON.stringify(member.channels) })
      .onConflictDoUpdate({
        target: [projectMembersTable.projectId, projectMembersTable.userId],
        set: { channels: JSON.stringify(member.channels) },
      })
      .run();
    return member;
  }

  findByProject(tenantId: string, projectId: string): ProjectMember[] {
    const rows = this.db
      .select()
      .from(projectMembersTable)
      .where(
        and(eq(projectMembersTable.tenantId, tenantId), eq(projectMembersTable.projectId, projectId)),
      )
      .all();
    return rows.map(toMember);
  }

  remove(tenantId: string, projectId: string, userId: string): number {
    const result = this.db
      .delete(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.tenantId, tenantId),
          eq(projectMembersTable.projectId, projectId),
          eq(projectMembersTable.userId, userId),
        ),
      )
      .run();
    return result.changes;
  }
}
