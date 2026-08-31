import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { logger } from '../config/logger';
import { withTransaction } from '../shared/database';
import { ConflictError, NotFoundError } from '../shared/errors';
import { assertSnapshotSize, redactSensitive } from '../shared/redaction';
import { MilestoneSchema, type CreateMilestoneInput, type Milestone, type UpdateMilestoneInput } from './milestone.model';
import type { MilestoneEvent } from './milestone-outbox.model';
import type { MilestoneOutboxRepository } from './milestone-outbox.repository';
import type { MilestoneRepository } from './milestone.repository';
import type { ProjectActorContext } from './project.service';
import type { ProjectRepository } from './project.repository';

function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => before[key] !== after[key]);
}

function toSnapshot(milestone: Milestone): Record<string, unknown> {
  return redactSensitive(milestone) as Record<string, unknown>;
}

/**
 * Business logic for milestones. Each mutation writes the milestone row and a matching outbox
 * event in one DB transaction (spec §5.2), so a committed milestone change is never lost before
 * the audit/notification event is durably recorded for the future relay to publish.
 */
export class MilestoneService {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly milestoneRepository: MilestoneRepository,
    private readonly outboxRepository: MilestoneOutboxRepository,
    private readonly projectRepository: ProjectRepository,
  ) {}

  private assertProjectExists(actor: ProjectActorContext, projectId: string): void {
    if (!this.projectRepository.findById(actor.tenantId, projectId)) {
      throw new NotFoundError(`Project ${projectId} was not found`);
    }
  }

  create(actor: ProjectActorContext, projectId: string, input: CreateMilestoneInput): Milestone {
    this.assertProjectExists(actor, projectId);

    const now = new Date().toISOString();
    const milestone = MilestoneSchema.parse({
      id: randomUUID(),
      tenantId: actor.tenantId,
      projectId,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });

    const after = toSnapshot(milestone);
    assertSnapshotSize(after);

    const event: MilestoneEvent = {
      eventId: randomUUID(),
      eventType: 'milestone.created',
      occurredAt: now,
      tenantId: actor.tenantId,
      projectId,
      milestoneId: milestone.id,
      actorId: actor.userId,
      before: null,
      after,
      changedFields: [],
      metadata: {},
    };

    withTransaction(this.sqlite, () => {
      this.milestoneRepository.insert(milestone);
      this.outboxRepository.insert(event);
    });

    logger.info('Milestone created', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'milestone.create',
      projectId,
      milestoneId: milestone.id,
      outcome: 'success',
    });

    return milestone;
  }

  getById(actor: ProjectActorContext, projectId: string, milestoneId: string): Milestone {
    const milestone = this.milestoneRepository.findById(actor.tenantId, projectId, milestoneId);
    if (!milestone) {
      throw new NotFoundError(`Milestone ${milestoneId} was not found`);
    }
    return milestone;
  }

  listByProject(actor: ProjectActorContext, projectId: string): Milestone[] {
    this.assertProjectExists(actor, projectId);
    return this.milestoneRepository.findByProject(actor.tenantId, projectId);
  }

  update(
    actor: ProjectActorContext,
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Milestone {
    this.assertProjectExists(actor, projectId);
    const existing = this.getById(actor, projectId, milestoneId);
    if (existing.status === 'closed') {
      throw new ConflictError('Cannot update a closed milestone');
    }

    const updatedAt = new Date().toISOString();
    const updated = MilestoneSchema.parse({
      ...existing,
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      dueDate: input.dueDate ?? existing.dueDate,
      updatedAt,
    });

    const changedFields = diffFields(existing, updated).filter((field) => field !== 'updatedAt');
    if (changedFields.length === 0) {
      return existing;
    }

    const before = toSnapshot(existing);
    const after = toSnapshot(updated);
    assertSnapshotSize(before);
    assertSnapshotSize(after);

    const event: MilestoneEvent = {
      eventId: randomUUID(),
      eventType: 'milestone.updated',
      occurredAt: updatedAt,
      tenantId: actor.tenantId,
      projectId,
      milestoneId,
      actorId: actor.userId,
      before,
      after,
      changedFields,
      metadata: {},
    };

    withTransaction(this.sqlite, () => {
      const changes = this.milestoneRepository.update(
        actor.tenantId,
        projectId,
        milestoneId,
        { title: updated.title, description: updated.description, dueDate: updated.dueDate },
        updatedAt,
      );
      if (changes === 0) {
        throw new NotFoundError(`Milestone ${milestoneId} was not found`);
      }
      this.outboxRepository.insert(event);
    });

    logger.info('Milestone updated', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'milestone.update',
      projectId,
      milestoneId,
      changedFields,
      outcome: 'success',
    });

    return updated;
  }

  close(actor: ProjectActorContext, projectId: string, milestoneId: string): Milestone {
    this.assertProjectExists(actor, projectId);
    const existing = this.getById(actor, projectId, milestoneId);
    if (existing.status === 'closed') {
      throw new ConflictError('Milestone is already closed');
    }

    const updatedAt = new Date().toISOString();
    const updated: Milestone = { ...existing, status: 'closed', updatedAt };

    const before = toSnapshot(existing);
    const after = toSnapshot(updated);
    assertSnapshotSize(before);
    assertSnapshotSize(after);

    const event: MilestoneEvent = {
      eventId: randomUUID(),
      eventType: 'milestone.closed',
      occurredAt: updatedAt,
      tenantId: actor.tenantId,
      projectId,
      milestoneId,
      actorId: actor.userId,
      before,
      after,
      changedFields: ['status'],
      metadata: {},
    };

    withTransaction(this.sqlite, () => {
      const changes = this.milestoneRepository.update(
        actor.tenantId,
        projectId,
        milestoneId,
        { status: 'closed' },
        updatedAt,
      );
      if (changes === 0) {
        throw new NotFoundError(`Milestone ${milestoneId} was not found`);
      }
      this.outboxRepository.insert(event);
    });

    logger.info('Milestone closed', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'milestone.close',
      projectId,
      milestoneId,
      outcome: 'success',
    });

    return updated;
  }
}
