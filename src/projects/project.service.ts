import { randomUUID } from 'crypto';
import { logger } from '../config/logger';
import { NotFoundError } from '../shared/errors';
import {
  ProjectSchema,
  type CreateProjectInput,
  type Project,
  type ProjectStatus,
} from './project.model';
import type { ProjectRepository } from './project.repository';

export interface ProjectActorContext {
  userId: string;
  tenantId: string;
}

/** Business logic for projects. Tenant scope always flows from the verified actor, never client input. */
export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  /** Creates a project owned by the actor's tenant; `tenantId` always comes from `actor`, never `input`. */
  create(actor: ProjectActorContext, input: CreateProjectInput): Project {
    const now = new Date().toISOString();
    const project = ProjectSchema.parse({
      id: randomUUID(),
      tenantId: actor.tenantId,
      teamId: input.teamId,
      name: input.name,
      description: input.description,
      ownerId: input.ownerId,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    });

    this.repository.insert(project);
    logger.info('Project created', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'project.create',
      projectId: project.id,
      outcome: 'success',
    });

    return project;
  }

  /** Fetches a single project scoped to the actor's tenant; throws `NotFoundError` if absent or cross-tenant. */
  getById(actor: ProjectActorContext, id: string): Project {
    const project = this.repository.findById(actor.tenantId, id);
    if (!project) {
      throw new NotFoundError(`Project ${id} was not found`);
    }
    return project;
  }

  /** Lists all projects for a team, scoped to the actor's tenant. */
  getByTeam(actor: ProjectActorContext, teamId: string): Project[] {
    return this.repository.findByTeam(actor.tenantId, teamId);
  }

  /** Transitions a tenant-owned project's status; throws `NotFoundError` if absent or cross-tenant. */
  updateStatus(actor: ProjectActorContext, id: string, status: ProjectStatus): Project {
    const updatedAt = new Date().toISOString();
    const changes = this.repository.updateStatus(actor.tenantId, id, status, updatedAt);
    if (changes === 0) {
      throw new NotFoundError(`Project ${id} was not found`);
    }

    logger.info('Project status updated', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'project.updateStatus',
      projectId: id,
      toStatus: status,
      outcome: 'success',
    });

    return this.getById(actor, id);
  }

  /** Deletes a tenant-owned project; throws `NotFoundError` if absent or cross-tenant. */
  delete(actor: ProjectActorContext, id: string): void {
    const changes = this.repository.delete(actor.tenantId, id);
    if (changes === 0) {
      throw new NotFoundError(`Project ${id} was not found`);
    }

    logger.info('Project deleted', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'project.delete',
      projectId: id,
      outcome: 'success',
    });
  }
}
