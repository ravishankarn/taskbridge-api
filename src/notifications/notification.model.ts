import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { AuditEntityTypeSchema } from './audit-event.model';

export const NotificationChannelSchema = z.enum(['in_app']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationStatusSchema = z.enum(['unread', 'read']);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

// The unique index on (eventId, recipientUserId, channel) is the duplicate guard: replaying a
// dispatch batch collides in the database rather than relying on application-side checks.
export const notificationsTable = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    eventId: text('eventId').notNull(),
    recipientUserId: text('recipientUserId').notNull(),
    channel: text('channel').notNull(),
    projectId: text('projectId').notNull(),
    entityType: text('entityType').notNull(),
    entityId: text('entityId').notNull(),
    eventType: text('eventType').notNull(),
    status: text('status').notNull(),
    createdAt: text('createdAt').notNull(),
    readAt: text('readAt'),
  },
  (table) => [
    uniqueIndex('notifications_event_recipient_channel_idx').on(
      table.eventId,
      table.recipientUserId,
      table.channel,
    ),
    index('notifications_tenant_recipient_idx').on(
      table.tenantId,
      table.recipientUserId,
      table.createdAt,
    ),
  ],
);

// Dispatch progress is tracked per audit event, independent of milestone_outbox_events.publishedAt,
// so events audited before this feature existed are still picked up exactly once.
export const notificationDispatchStateTable = sqliteTable(
  'notification_dispatch_state',
  {
    eventId: text('eventId').primaryKey(),
    tenantId: text('tenantId').notNull(),
    dispatchedAt: text('dispatchedAt').notNull(),
    recipientCount: integer('recipientCount').notNull().default(0),
  },
  (table) => [
    index('notification_dispatch_state_tenant_idx').on(table.tenantId, table.dispatchedAt),
  ],
);

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  eventId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  channel: NotificationChannelSchema,
  projectId: z.string().uuid(),
  entityType: AuditEntityTypeSchema,
  entityId: z.string().uuid(),
  eventType: z.string().trim().min(1).max(100),
  status: NotificationStatusSchema,
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});

export type Notification = z.infer<typeof NotificationSchema>;

export const MAX_NOTIFICATION_PAGE_SIZE = 100;

export const NotificationQuerySchema = z
  .object({
    status: NotificationStatusSchema.optional(),
    projectId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_NOTIFICATION_PAGE_SIZE).default(50),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;

export const NotificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** Opaque keyset cursor payload; decoded values are only used as bounds inside an owner-scoped query. */
export const NotificationCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
});

export type NotificationCursor = z.infer<typeof NotificationCursorSchema>;
