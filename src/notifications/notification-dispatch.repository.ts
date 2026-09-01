import { asc, eq, isNull } from 'drizzle-orm';
import { auditEventsTable } from './audit-event.model';
import type { NotificationsDb } from './notification.database';
import { notificationDispatchStateTable } from './notification.model';

export interface PendingAuditEvent {
  eventId: string;
  tenantId: string;
  projectId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  actorId: string;
  occurredAt: string;
}

/**
 * Tracks which audit events have been fanned out to notifications. The pending query is an
 * anti-join against `audit_events`, so any already-audited event is still picked up regardless of
 * the outbox `publishedAt` state owned by the audit relay.
 */
export class NotificationDispatchRepository {
  constructor(private readonly db: NotificationsDb) {}

  findPendingEvents(limit: number): PendingAuditEvent[] {
    return this.db
      .select({
        eventId: auditEventsTable.eventId,
        tenantId: auditEventsTable.tenantId,
        projectId: auditEventsTable.projectId,
        entityType: auditEventsTable.entityType,
        entityId: auditEventsTable.entityId,
        eventType: auditEventsTable.eventType,
        actorId: auditEventsTable.actorId,
        occurredAt: auditEventsTable.occurredAt,
      })
      .from(auditEventsTable)
      .leftJoin(
        notificationDispatchStateTable,
        eq(auditEventsTable.eventId, notificationDispatchStateTable.eventId),
      )
      .where(isNull(notificationDispatchStateTable.eventId))
      .orderBy(asc(auditEventsTable.occurredAt), asc(auditEventsTable.eventId))
      .limit(limit)
      .all();
  }

  markDispatched(
    eventId: string,
    tenantId: string,
    dispatchedAt: string,
    recipientCount: number,
  ): void {
    this.db
      .insert(notificationDispatchStateTable)
      .values({ eventId, tenantId, dispatchedAt, recipientCount })
      .onConflictDoNothing({ target: notificationDispatchStateTable.eventId })
      .run();
  }
}
