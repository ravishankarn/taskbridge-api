import { logger } from '../config/logger';
import { NotFoundError } from '../shared/errors';
import { ProjectMemberSchema, type AddProjectMemberInput, type ProjectMember } from './project-member.model';
import type { ProjectMemberRepository } from './project-member.repository';
import type { ProjectActorContext } from './project.service';
import type { ProjectRepository } from './project.repository';

export interface ResolvedRecipient {
  userId: string;
  channels: ProjectMember['channels'];
}

/**
 * Recipient-resolution boundary (spec §5.4): the future Notification & Audit Service must resolve
 * authorized recipients through this interface rather than querying Project Service tables directly
 * or inferring membership from client-supplied event payloads.
 */
export class ProjectMemberService {
  constructor(
    private readonly repository: ProjectMemberRepository,
    private readonly projectRepository: ProjectRepository,
  ) {}

  private assertProjectExists(actor: ProjectActorContext, projectId: string): void {
    if (!this.projectRepository.findById(actor.tenantId, projectId)) {
      throw new NotFoundError(`Project ${projectId} was not found`);
    }
  }

  addMember(
    actor: ProjectActorContext,
    projectId: string,
    input: AddProjectMemberInput,
  ): ProjectMember {
    this.assertProjectExists(actor, projectId);

    const member = ProjectMemberSchema.parse({
      projectId,
      tenantId: actor.tenantId,
      userId: input.userId,
      channels: input.channels,
      createdAt: new Date().toISOString(),
    });

    this.repository.upsert(member);
    logger.info('Project member added', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'projectMember.add',
      projectId,
      memberId: member.userId,
      outcome: 'success',
    });

    return member;
  }

  removeMember(actor: ProjectActorContext, projectId: string, userId: string): void {
    this.assertProjectExists(actor, projectId);
    const changes = this.repository.remove(actor.tenantId, projectId, userId);
    if (changes === 0) {
      throw new NotFoundError(`Project member ${userId} was not found`);
    }

    logger.info('Project member removed', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'projectMember.remove',
      projectId,
      memberId: userId,
      outcome: 'success',
    });
  }

  listMembers(actor: ProjectActorContext, projectId: string): ProjectMember[] {
    this.assertProjectExists(actor, projectId);
    return this.repository.findByProject(actor.tenantId, projectId);
  }

  /** Tenant-scoped recipient resolution for a project's authorized members. */
  resolveRecipients(tenantId: string, projectId: string): ResolvedRecipient[] {
    return this.repository
      .findByProject(tenantId, projectId)
      .map((member) => ({ userId: member.userId, channels: member.channels }));
  }

  /** Tenant-scoped list of projects a user is a member of; used for resource-level authorization. */
  listAuthorizedProjectIds(tenantId: string, userId: string): string[] {
    return this.repository.findProjectIdsByUser(tenantId, userId);
  }
}
