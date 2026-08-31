import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

export const MilestoneStatusSchema = z.enum(['open', 'closed']);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

export const milestonesTable = sqliteTable(
  'milestones',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    projectId: text('projectId').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: text('dueDate'),
    status: text('status').notNull(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (table) => [index('milestones_tenant_project_idx').on(table.tenantId, table.projectId)],
);

export const MilestoneSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  dueDate: z.string().datetime().optional(),
  status: MilestoneStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Milestone = z.infer<typeof MilestoneSchema>;

export const CreateMilestoneInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  dueDate: z.string().datetime().optional(),
});

export type CreateMilestoneInput = z.infer<typeof CreateMilestoneInputSchema>;

export const UpdateMilestoneInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    dueDate: z.string().datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneInputSchema>;

export const MilestoneIdParamSchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
});
