import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

export const ProjectStatusSchema = z.enum(['planned', 'active', 'completed', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

// ORM table definition — column names preserved from the original schema to avoid a data migration.
export const projectsTable = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    teamId: text('teamId').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: text('ownerId').notNull(),
    status: text('status').notNull(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (table) => [index('projects_tenant_team_idx').on(table.tenantId, table.teamId)],
);

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  ownerId: z.string().uuid(),
  status: ProjectStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Project = z.infer<typeof ProjectSchema>;

// tenantId is intentionally excluded: it must be derived from the verified JWT, never client input.
export const CreateProjectInputSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  ownerId: z.string().uuid(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectStatusInputSchema = z.object({
  status: ProjectStatusSchema,
});

export type UpdateProjectStatusInput = z.infer<typeof UpdateProjectStatusInputSchema>;

export const ProjectIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const TeamIdParamSchema = z.object({
  teamId: z.string().uuid(),
});

// Shared route-param schema for nested resources, e.g. /projects/:projectId/milestones.
export const ProjectRouteParamSchema = z.object({
  projectId: z.string().uuid(),
});
