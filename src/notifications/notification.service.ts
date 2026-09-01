import { logger } from '../config/logger';
import { NotFoundError, ValidationError } from '../shared/errors';
import {
  NotificationCursorSchema,
  type Notification,
  type NotificationQuery,
} from './notification.model';
import type { NotificationRepository } from './notification.repository';

export interface NotificationActorContext {
  userId: string;
  tenantId: string;
}

export interface NotificationPage {
  items: Notification[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

function encodeCursor(notification: Notification): string {
  const payload = JSON.stringify({ createdAt: notification.createdAt, id: notification.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string) {
  try {
    const payload: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return NotificationCursorSchema.parse(payload);
  } catch {
    throw new ValidationError('Invalid pagination cursor');
  }
}

/**
 * Read side for in-app notifications. Both tenant and recipient scope come from the verified actor,
 * so a caller can only list or mutate their own notifications.
 */
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  list(actor: NotificationActorContext, query: NotificationQuery): NotificationPage {
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

    // Fetch one extra row to detect a further page without running a count query.
    const rows = this.repository.findPage(actor.tenantId, actor.userId, {
      status: query.status,
      projectId: query.projectId,
      cursor,
      limit: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && last ? encodeCursor(last) : null,
      },
    };
  }

  /** Idempotent: marking an already-read notification returns it unchanged. */
  markRead(actor: NotificationActorContext, id: string): Notification {
    const readAt = new Date().toISOString();
    this.repository.markRead(actor.tenantId, actor.userId, id, readAt);

    const notification = this.repository.findOwned(actor.tenantId, actor.userId, id);
    if (!notification) {
      throw new NotFoundError(`Notification ${id} was not found`);
    }

    logger.info('Notification marked read', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'notification.markRead',
      notificationId: id,
      outcome: 'success',
    });

    return notification;
  }
}
