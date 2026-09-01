import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { MilestoneEventTypeSchema, milestoneOutboxTable } from '../projects/milestone-outbox.model';
import type { NotificationsDb } from './notification.database';

/** Raw column shape returned by the outbox query, before validation. */
export interface MilestoneOutboxRawRow {
  eventId: string;
  tenantId: string;
  eventType: string;
  projectId: string;
  milestoneId: string;
  actorId: string;
  occurredAt: string;
  beforeState: string | null;
  afterState: string | null;
  changedFields: string;
  metadata: string;
  attemptCount: number;
}

/**
 * Validation for an outbox row consumed by the relay. Rows are treated as external input because
 * the relay runs outside any authenticated request context.
 */
export const MilestoneOutboxRowSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string().uuid(),
  eventType: MilestoneEventTypeSchema,
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  actorId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  beforeState: z.string().nullable(),
  afterState: z.string().nullable(),
  changedFields: z.string(),
  metadata: z.string(),
});

export type MilestoneOutboxRow = z.infer<typeof MilestoneOutboxRowSchema>;

/**
 * Read/relay-cursor access to the Project Service outbox. Reads are intentionally cross-tenant
 * because the relay drains every tenant's backlog; tenant scope is carried on each row and is
 * required for the writes below.
 */
export class MilestoneOutboxReader {
  constructor(private readonly db: NotificationsDb) {}

  findUnpublished(limit: number, maxAttempts: number): MilestoneOutboxRawRow[] {
    return this.db
      .select({
        eventId: milestoneOutboxTable.eventId,
        tenantId: milestoneOutboxTable.tenantId,
        eventType: milestoneOutboxTable.eventType,
        projectId: milestoneOutboxTable.projectId,
        milestoneId: milestoneOutboxTable.milestoneId,
        actorId: milestoneOutboxTable.actorId,
        occurredAt: milestoneOutboxTable.occurredAt,
        beforeState: milestoneOutboxTable.beforeState,
        afterState: milestoneOutboxTable.afterState,
        changedFields: milestoneOutboxTable.changedFields,
        metadata: milestoneOutboxTable.metadata,
        attemptCount: milestoneOutboxTable.attemptCount,
      })
      .from(milestoneOutboxTable)
      .where(
        and(
          isNull(milestoneOutboxTable.publishedAt),
          lt(milestoneOutboxTable.attemptCount, maxAttempts),
        ),
      )
      .orderBy(asc(milestoneOutboxTable.occurredAt), asc(milestoneOutboxTable.eventId))
      .limit(limit)
      .all();
  }

  markPublished(tenantId: string, eventId: string, publishedAt: string): number {
    const result = this.db
      .update(milestoneOutboxTable)
      .set({ publishedAt, attemptCount: sql`${milestoneOutboxTable.attemptCount} + 1` })
      .where(
        and(
          eq(milestoneOutboxTable.tenantId, tenantId),
          eq(milestoneOutboxTable.eventId, eventId),
          isNull(milestoneOutboxTable.publishedAt),
        ),
      )
      .run();
    return result.changes;
  }

  recordFailedAttempt(tenantId: string, eventId: string): number {
    const result = this.db
      .update(milestoneOutboxTable)
      .set({ attemptCount: sql`${milestoneOutboxTable.attemptCount} + 1` })
      .where(
        and(eq(milestoneOutboxTable.tenantId, tenantId), eq(milestoneOutboxTable.eventId, eventId)),
      )
      .run();
    return result.changes;
  }
}
