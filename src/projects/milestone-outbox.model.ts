import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

export const MilestoneEventTypeSchema = z.enum([
  'milestone.created',
  'milestone.updated',
  'milestone.closed',
]);
export type MilestoneEventType = z.infer<typeof MilestoneEventTypeSchema>;

// Transactional outbox: written in the same DB transaction as the milestone mutation it describes.
// A future relay is responsible for publishing rows and marking `publishedAt`; not implemented here.
export const milestoneOutboxTable = sqliteTable(
  'milestone_outbox_events',
  {
    eventId: text('eventId').primaryKey(),
    tenantId: text('tenantId').notNull(),
    eventType: text('eventType').notNull(),
    projectId: text('projectId').notNull(),
    milestoneId: text('milestoneId').notNull(),
    actorId: text('actorId').notNull(),
    occurredAt: text('occurredAt').notNull(),
    beforeState: text('beforeState'),
    afterState: text('afterState'),
    changedFields: text('changedFields').notNull(),
    metadata: text('metadata').notNull(),
    publishedAt: text('publishedAt'),
    attemptCount: integer('attemptCount').notNull().default(0),
  },
  (table) => [
    index('milestone_outbox_publish_idx').on(table.publishedAt),
    index('milestone_outbox_tenant_idx').on(table.tenantId, table.occurredAt),
  ],
);

export const MilestoneEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: MilestoneEventTypeSchema,
  occurredAt: z.string().datetime(),
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  actorId: z.string().uuid(),
  before: z.record(z.unknown()).nullable(),
  after: z.record(z.unknown()).nullable(),
  changedFields: z.array(z.string()),
  metadata: z.record(z.unknown()).default({}),
});

export type MilestoneEvent = z.infer<typeof MilestoneEventSchema>;
