import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';
import type { NotificationsDb } from './notification.database';
import {
  NotificationSchema,
  notificationsTable,
  type Notification,
  type NotificationCursor,
  type NotificationStatus,
} from './notification.model';

type NotificationRow = typeof notificationsTable.$inferSelect;

export interface NotificationPageFilter {
  status?: NotificationStatus;
  projectId?: string;
  cursor?: NotificationCursor;
  limit: number;
}

function toNotification(row: NotificationRow): Notification {
  return NotificationSchema.parse(row);
}

/**
 * Persistence for in-app notifications. Reads are scoped by tenant *and* recipient, so a caller can
 * only ever see their own notifications.
 */
export class NotificationRepository {
  constructor(private readonly db: NotificationsDb) {}

  /** Inserts the notification, ignoring the (eventId, recipientUserId, channel) collision. */
  insertIfAbsent(notification: Notification): boolean {
    const result = this.db
      .insert(notificationsTable)
      .values(notification)
      .onConflictDoNothing({
        target: [
          notificationsTable.eventId,
          notificationsTable.recipientUserId,
          notificationsTable.channel,
        ],
      })
      .run();
    return result.changes > 0;
  }

  findOwned(tenantId: string, recipientUserId: string, id: string): Notification | undefined {
    const row = this.db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, tenantId),
          eq(notificationsTable.recipientUserId, recipientUserId),
          eq(notificationsTable.id, id),
        ),
      )
      .get();
    return row ? toNotification(row) : undefined;
  }

  findPage(
    tenantId: string,
    recipientUserId: string,
    filter: NotificationPageFilter,
  ): Notification[] {
    const conditions: SQL[] = [
      eq(notificationsTable.tenantId, tenantId),
      eq(notificationsTable.recipientUserId, recipientUserId),
    ];

    if (filter.status) {
      conditions.push(eq(notificationsTable.status, filter.status));
    }
    if (filter.projectId) {
      conditions.push(eq(notificationsTable.projectId, filter.projectId));
    }
    if (filter.cursor) {
      const keyset = or(
        lt(notificationsTable.createdAt, filter.cursor.createdAt),
        and(
          eq(notificationsTable.createdAt, filter.cursor.createdAt),
          lt(notificationsTable.id, filter.cursor.id),
        ),
      );
      if (keyset) {
        conditions.push(keyset);
      }
    }

    const rows = this.db
      .select()
      .from(notificationsTable)
      .where(and(...conditions))
      .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
      .limit(filter.limit)
      .all();
    return rows.map(toNotification);
  }

  /** Marks an unread notification read. Owner scope is part of the predicate, never checked in memory. */
  markRead(tenantId: string, recipientUserId: string, id: string, readAt: string): number {
    const result = this.db
      .update(notificationsTable)
      .set({ status: 'read', readAt })
      .where(
        and(
          eq(notificationsTable.tenantId, tenantId),
          eq(notificationsTable.recipientUserId, recipientUserId),
          eq(notificationsTable.id, id),
          eq(notificationsTable.status, 'unread'),
        ),
      )
      .run();
    return result.changes;
  }
}
