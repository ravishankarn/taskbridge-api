import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

export const AuditEntityTypeSchema = z.enum(['milestone']);
export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>;

// Append-only compliance history. `eventId` is reused from the source outbox event so that a
// replayed relay batch collides on the primary key instead of creating a duplicate audit entry.
// Updates and deletes are blocked by SQLite triggers (see notification.database.ts).
export const auditEventsTable = sqliteTable(
  'audit_events',
  {
    eventId: text('eventId').primaryKey(),
    tenantId: text('tenantId').notNull(),
    eventType: text('eventType').notNull(),
    entityType: text('entityType').notNull(),
    entityId: text('entityId').notNull(),
    projectId: text('projectId').notNull(),
    actorId: text('actorId').notNull(),
    occurredAt: text('occurredAt').notNull(),
    recordedAt: text('recordedAt').notNull(),
    beforeState: text('beforeState'),
    afterState: text('afterState'),
    changedFields: text('changedFields').notNull(),
    metadata: text('metadata').notNull(),
  },
  (table) => [
    index('audit_events_tenant_occurred_idx').on(table.tenantId, table.occurredAt),
    index('audit_events_tenant_entity_idx').on(table.tenantId, table.entityId),
    index('audit_events_tenant_project_idx').on(table.tenantId, table.projectId, table.occurredAt),
  ],
);

export const AuditEventSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string().uuid(),
  eventType: z.string().trim().min(1).max(100),
  entityType: AuditEntityTypeSchema,
  entityId: z.string().uuid(),
  projectId: z.string().uuid(),
  actorId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  before: z.record(z.unknown()).nullable(),
  after: z.record(z.unknown()).nullable(),
  changedFields: z.array(z.string()),
  metadata: z.record(z.unknown()),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** Event types accepted as a filter value; stored `eventType` stays a free string for forward compatibility. */
export const AuditEventTypeFilterSchema = z.enum([
  'milestone.created',
  'milestone.updated',
  'milestone.closed',
]);

export const AuditEventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});

export const MAX_AUDIT_PAGE_SIZE = 100;

export const AuditEventQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
    entityId: z.string().uuid().optional(),
    eventType: AuditEventTypeFilterSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_AUDIT_PAGE_SIZE).default(50),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must not be later than `to`',
    path: ['from'],
  });

export type AuditEventQuery = z.infer<typeof AuditEventQuerySchema>;

/** Opaque keyset cursor payload; decoded values are only ever used as bounds inside a tenant-scoped query. */
export const AuditCursorSchema = z.object({
  occurredAt: z.string().datetime(),
  eventId: z.string().uuid(),
});

export type AuditCursor = z.infer<typeof AuditCursorSchema>;
