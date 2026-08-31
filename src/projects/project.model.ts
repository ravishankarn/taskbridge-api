/**
 * INHERITED / AI-GENERATED CODE — UNREVIEWED.
 *
 * This file was inherited from an upstream AI-assisted contribution and has NOT undergone
 * architecture or security review. Do not treat it as a vetted reference pattern, and do not
 * refactor/"clean up" it silently — see .github/copilot-instructions.md.
 * TODO(security-review): full architecture and security review pending.
 */
import { z } from 'zod';

export const ProjectStatusSchema = z.enum(['planned', 'active', 'completed', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ownerId: z.string().uuid(),
  status: ProjectStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectInputSchema = ProjectSchema.pick({
  tenantId: true,
  teamId: true,
  name: true,
  description: true,
  ownerId: true,
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectStatusInputSchema = z.object({
  status: ProjectStatusSchema,
});

export type UpdateProjectStatusInput = z.infer<typeof UpdateProjectStatusInputSchema>;
