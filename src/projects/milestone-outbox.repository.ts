import type { ProjectsDb } from './project.database';
import { milestoneOutboxTable, type MilestoneEvent } from './milestone-outbox.model';

/** Transactional-outbox writer; callers must run insert() inside the same DB transaction as the mutation. */
export class MilestoneOutboxRepository {
  constructor(private readonly db: ProjectsDb) {}

  insert(event: MilestoneEvent): void {
    this.db
      .insert(milestoneOutboxTable)
      .values({
        eventId: event.eventId,
        tenantId: event.tenantId,
        eventType: event.eventType,
        projectId: event.projectId,
        milestoneId: event.milestoneId,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        beforeState: event.before === null ? null : JSON.stringify(event.before),
        afterState: event.after === null ? null : JSON.stringify(event.after),
        changedFields: JSON.stringify(event.changedFields),
        metadata: JSON.stringify(event.metadata),
        publishedAt: null,
        attemptCount: 0,
      })
      .run();
  }
}
