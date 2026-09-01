import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { logger } from '../config/logger';
import { withTransaction } from '../shared/database';
import type {
  NotificationDispatchRepository,
  PendingAuditEvent,
} from './notification-dispatch.repository';
import { NotificationSchema } from './notification.model';
import type { NotificationRepository } from './notification.repository';

const DEFAULT_BATCH_SIZE = 100;
const IN_APP_CHANNEL = 'in_app';

export interface NotificationDispatcherOptions {
  batchSize?: number;
}

/** Recipient-resolution port, satisfied by the Project Service `ProjectMemberService`. */
export interface RecipientDirectory {
  resolveRecipients(tenantId: string, projectId: string): { userId: string; channels: string[] }[];
}

export interface NotificationDispatchResult {
  fetched: number;
  created: number;
  duplicates: number;
  failed: number;
}

/**
 * Fans audited milestone events out to in-app notifications for project members.
 *
 * Tenant scope comes from the audit event itself, never from client input, because this runs
 * outside any authenticated request. Delivery is at-least-once: the dispatch-state row and the
 * unique index on (eventId, recipientUserId, channel) both prevent user-visible duplicates.
 */
export class NotificationDispatcher {
  private readonly batchSize: number;

  constructor(
    private readonly sqlite: Database.Database,
    private readonly dispatchRepository: NotificationDispatchRepository,
    private readonly notificationRepository: NotificationRepository,
    private readonly recipientDirectory: RecipientDirectory,
    options: NotificationDispatcherOptions = {},
  ) {
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  /** Processes one batch of audited-but-undispatched events. Safe to call repeatedly. */
  runOnce(): NotificationDispatchResult {
    const events = this.dispatchRepository.findPendingEvents(this.batchSize);
    const result: NotificationDispatchResult = {
      fetched: events.length,
      created: 0,
      duplicates: 0,
      failed: 0,
    };

    for (const event of events) {
      try {
        const counts = withTransaction(this.sqlite, () => this.dispatchEvent(event));
        result.created += counts.created;
        result.duplicates += counts.duplicates;

        logger.info('Audited event fanned out to in-app notifications', {
          tenantId: event.tenantId,
          operation: 'notification.dispatch',
          eventId: event.eventId,
          eventType: event.eventType,
          created: counts.created,
          duplicates: counts.duplicates,
          outcome: 'success',
        });
      } catch (error) {
        result.failed += 1;
        logger.error('Failed to fan out audited event to notifications', {
          tenantId: event.tenantId,
          operation: 'notification.dispatch',
          eventId: event.eventId,
          outcome: 'failure',
          // Only the error class is logged: driver/parser messages can echo stored values.
          reason: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    return result;
  }

  private dispatchEvent(event: PendingAuditEvent): { created: number; duplicates: number } {
    const recipients = this.recipientDirectory
      .resolveRecipients(event.tenantId, event.projectId)
      // The actor is not notified about their own change.
      .filter(
        (recipient) =>
          recipient.userId !== event.actorId && recipient.channels.includes(IN_APP_CHANNEL),
      );

    const createdAt = new Date().toISOString();
    let created = 0;
    let duplicates = 0;

    for (const recipient of recipients) {
      const notification = NotificationSchema.parse({
        id: randomUUID(),
        tenantId: event.tenantId,
        eventId: event.eventId,
        recipientUserId: recipient.userId,
        channel: IN_APP_CHANNEL,
        projectId: event.projectId,
        entityType: event.entityType,
        entityId: event.entityId,
        eventType: event.eventType,
        status: 'unread',
        createdAt,
        readAt: null,
      });

      if (this.notificationRepository.insertIfAbsent(notification)) {
        created += 1;
      } else {
        duplicates += 1;
      }
    }

    this.dispatchRepository.markDispatched(
      event.eventId,
      event.tenantId,
      createdAt,
      recipients.length,
    );

    return { created, duplicates };
  }
}
