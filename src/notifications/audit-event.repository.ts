import { and, asc, desc, eq, gte, inArray, lt, lte, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  AuditEventSchema,
  auditEventsTable,
  type AuditCursor,
  type AuditEvent,
} from './audit-event.model';
import type { NotificationsDb } from './notification.database';

type AuditEventRow = typeof auditEventsTable.$inferSelect;

export interface AuditEventFilter {
  projectId?: string;
  entityId?: string;
  eventType?: string;
  from?: string;
  to?: string;
  cursor?: AuditCursor;
  /** When set, results are additionally restricted to these projects (resource-level authorization). */
  authorizedProjectIds?: string[];
  limit: number;
}

const JsonObjectSchema = z.record(z.unknown());

function parseSnapshot(raw: string | null): Record<string, unknown> | null {
  return raw === null ? null : JsonObjectSchema.parse(JSON.parse(raw));
}

function toAuditEvent(row: AuditEventRow): AuditEvent {
  return AuditEventSchema.parse({
    ...row,
    before: parseSnapshot(row.beforeState),
    after: parseSnapshot(row.afterState),
    changedFields: z.array(z.string()).parse(JSON.parse(row.changedFields)),
    metadata: JsonObjectSchema.parse(JSON.parse(row.metadata)),
  });
}

/**
 * Append-only persistence for audit events. Every read is tenant-scoped in SQL, and no update or
 * delete method exists by design; corrections are made by appending a compensating event.
 */
export class AuditEventRepository {
  constructor(private readonly db: NotificationsDb) {}

  /** Inserts the event, ignoring a primary-key collision. Returns false when already recorded. */
  insertIfAbsent(event: AuditEvent): boolean {
    const result = this.db
      .insert(auditEventsTable)
      .values({
        eventId: event.eventId,
        tenantId: event.tenantId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        projectId: event.projectId,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        recordedAt: event.recordedAt,
        beforeState: event.before === null ? null : JSON.stringify(event.before),
        afterState: event.after === null ? null : JSON.stringify(event.after),
        changedFields: JSON.stringify(event.changedFields),
        metadata: JSON.stringify(event.metadata),
      })
      .onConflictDoNothing({ target: auditEventsTable.eventId })
      .run();
    return result.changes > 0;
  }

  findById(tenantId: string, eventId: string): AuditEvent | undefined {
    const row = this.db
      .select()
      .from(auditEventsTable)
      .where(and(eq(auditEventsTable.tenantId, tenantId), eq(auditEventsTable.eventId, eventId)))
      .get();
    return row ? toAuditEvent(row) : undefined;
  }

  listByTenant(tenantId: string, limit = 50): AuditEvent[] {
    const rows = this.db
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.tenantId, tenantId))
      .orderBy(desc(auditEventsTable.occurredAt), asc(auditEventsTable.eventId))
      .limit(limit)
      .all();
    return rows.map(toAuditEvent);
  }

  listByEntity(tenantId: string, entityId: string, limit = 50): AuditEvent[] {
    const rows = this.db
      .select()
      .from(auditEventsTable)
      .where(and(eq(auditEventsTable.tenantId, tenantId), eq(auditEventsTable.entityId, entityId)))
      .orderBy(asc(auditEventsTable.occurredAt), asc(auditEventsTable.eventId))
      .limit(limit)
      .all();
    return rows.map(toAuditEvent);
  }

  /**
   * Newest-first keyset page. Tenant scope is the first predicate and is never optional, so filters
   * and cursors can only ever narrow the caller's own tenant partition.
   */
  findPage(tenantId: string, filter: AuditEventFilter): AuditEvent[] {
    if (filter.authorizedProjectIds?.length === 0) {
      return [];
    }

    const conditions: SQL[] = [eq(auditEventsTable.tenantId, tenantId)];

    if (filter.authorizedProjectIds) {
      conditions.push(inArray(auditEventsTable.projectId, filter.authorizedProjectIds));
    }
    if (filter.projectId) {
      conditions.push(eq(auditEventsTable.projectId, filter.projectId));
    }
    if (filter.entityId) {
      conditions.push(eq(auditEventsTable.entityId, filter.entityId));
    }
    if (filter.eventType) {
      conditions.push(eq(auditEventsTable.eventType, filter.eventType));
    }
    if (filter.from) {
      conditions.push(gte(auditEventsTable.occurredAt, filter.from));
    }
    if (filter.to) {
      conditions.push(lte(auditEventsTable.occurredAt, filter.to));
    }
    if (filter.cursor) {
      const keyset = or(
        lt(auditEventsTable.occurredAt, filter.cursor.occurredAt),
        and(
          eq(auditEventsTable.occurredAt, filter.cursor.occurredAt),
          lt(auditEventsTable.eventId, filter.cursor.eventId),
        ),
      );
      if (keyset) {
        conditions.push(keyset);
      }
    }

    const rows = this.db
      .select()
      .from(auditEventsTable)
      .where(and(...conditions))
      .orderBy(desc(auditEventsTable.occurredAt), desc(auditEventsTable.eventId))
      .limit(filter.limit)
      .all();
    return rows.map(toAuditEvent);
  }
}
