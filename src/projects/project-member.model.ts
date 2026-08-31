import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

export const NotificationChannelSchema = z.enum(['in_app', 'email']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const projectMembersTable = sqliteTable(
  'project_members',
  {
    projectId: text('projectId').notNull(),
    tenantId: text('tenantId').notNull(),
    userId: text('userId').notNull(),
    channels: text('channels').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('project_members_tenant_idx').on(table.tenantId, table.projectId),
  ],
);

export const ProjectMemberSchema = z.object({
  projectId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  channels: z.array(NotificationChannelSchema).min(1),
  createdAt: z.string().datetime(),
});

export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

export const AddProjectMemberInputSchema = z.object({
  userId: z.string().uuid(),
  channels: z.array(NotificationChannelSchema).min(1).default(['in_app']),
});

export type AddProjectMemberInput = z.infer<typeof AddProjectMemberInputSchema>;

export const ProjectMemberRouteParamSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
});
