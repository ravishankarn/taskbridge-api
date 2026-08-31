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

  getById(actor: ProjectActorContext, id: string): Project {
    const project = this.repository.findById(actor.tenantId, id);
    if (!project) {
      throw new NotFoundError(`Project ${id} was not found`);
    }
    return project;
  }

  getByTeam(actor: ProjectActorContext, teamId: string): Project[] {
    return this.repository.findByTeam(actor.tenantId, teamId);
  }

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
