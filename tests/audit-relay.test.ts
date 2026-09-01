import Database from 'better-sqlite3';
import { AuditEventRepository } from '../src/notifications/audit-event.repository';
import { MilestoneAuditRelay } from '../src/notifications/audit-relay';
import { MilestoneOutboxReader } from '../src/notifications/milestone-outbox.reader';
import { createNotificationsDb } from '../src/notifications/notification.database';
import { MilestoneOutboxRepository } from '../src/projects/milestone-outbox.repository';
import { MilestoneRepository } from '../src/projects/milestone.repository';
import { MilestoneService } from '../src/projects/milestone.service';
import { createProjectsDb } from '../src/projects/project.database';
import { ProjectRepository } from '../src/projects/project.repository';
import { ProjectService, type ProjectActorContext } from '../src/projects/project.service';

describe('MilestoneAuditRelay', () => {
  let sqlite: Database.Database;
  let relay: MilestoneAuditRelay;
  let auditRepository: AuditEventRepository;
  let milestoneService: MilestoneService;
  let projectService: ProjectService;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const teamId = '33333333-3333-4333-8333-333333333333';
  const ownerId = '55555555-5555-4555-8555-555555555555';
  const userId = '66666666-6666-4666-8666-666666666666';

  const actor: ProjectActorContext = { userId, tenantId };
  const otherTenantActor: ProjectActorContext = { userId, tenantId: otherTenantId };

  function countAuditRows(): number {
    const row = sqlite.prepare('SELECT COUNT(*) as count FROM audit_events').get() as {
      count: number;
    };
    return row.count;
  }

  function outboxRow(eventId: string): { publishedAt: string | null; attemptCount: number } {
    return sqlite
      .prepare('SELECT publishedAt, attemptCount FROM milestone_outbox_events WHERE eventId = ?')
      .get(eventId) as { publishedAt: string | null; attemptCount: number };
  }

  function resetOutboxCursor(): void {
    sqlite.prepare('UPDATE milestone_outbox_events SET publishedAt = NULL, attemptCount = 0').run();
  }

  beforeEach(() => {
    sqlite = new Database(':memory:');
    const projectsDb = createProjectsDb(sqlite);
    const notificationsDb = createNotificationsDb(sqlite);

    const projectRepository = new ProjectRepository(projectsDb);
    projectService = new ProjectService(projectRepository);
    milestoneService = new MilestoneService(
      sqlite,
      new MilestoneRepository(projectsDb),
      new MilestoneOutboxRepository(projectsDb),
      projectRepository,
    );

    auditRepository = new AuditEventRepository(notificationsDb);
    relay = new MilestoneAuditRelay(
      sqlite,
      new MilestoneOutboxReader(notificationsDb),
      auditRepository,
    );
  });

  afterEach(() => {
    sqlite.close();
  });

  function seedMilestone(seedActor: ProjectActorContext = actor) {
    const project = projectService.create(seedActor, { teamId, name: 'Launch plan', ownerId });
    const milestone = milestoneService.create(seedActor, project.id, { title: 'Design review' });
    return { project, milestone };
  }

  it('records an audit event for each unpublished outbox row and advances the cursor', () => {
    const { project, milestone } = seedMilestone();
    milestoneService.close(actor, project.id, milestone.id);

    const result = relay.runOnce();

    expect(result).toEqual({ fetched: 2, recorded: 2, duplicates: 0, failed: 0 });
    expect(countAuditRows()).toBe(2);

    const events = auditRepository.listByEntity(tenantId, milestone.id);
    expect(events.map((event) => event.eventType).sort()).toEqual([
      'milestone.closed',
      'milestone.created',
    ]);

    const created = events.find((event) => event.eventType === 'milestone.created');
    expect(created).toBeDefined();
    expect(created?.entityType).toBe('milestone');
    expect(created?.entityId).toBe(milestone.id);
    expect(created?.projectId).toBe(project.id);
    expect(created?.actorId).toBe(userId);
    expect(created?.tenantId).toBe(tenantId);
    expect(created?.before).toBeNull();
    expect(created?.after).toMatchObject({ id: milestone.id, status: 'open' });

    const closed = events.find((event) => event.eventType === 'milestone.closed');
    expect(closed?.changedFields).toEqual(['status']);
    expect(closed?.after).toMatchObject({ status: 'closed' });

    const unpublished = sqlite
      .prepare('SELECT COUNT(*) as count FROM milestone_outbox_events WHERE publishedAt IS NULL')
      .get() as { count: number };
    expect(unpublished.count).toBe(0);
  });

  it('reuses the outbox eventId as the audit primary key', () => {
    const { milestone } = seedMilestone();
    relay.runOnce();

    const outboxEventId = (
      sqlite.prepare('SELECT eventId FROM milestone_outbox_events').get() as { eventId: string }
    ).eventId;

    const event = auditRepository.findById(tenantId, outboxEventId);
    expect(event?.eventId).toBe(outboxEventId);
    expect(event?.entityId).toBe(milestone.id);
  });

  it('is idempotent when the same outbox rows are replayed', () => {
    seedMilestone();
    expect(relay.runOnce()).toEqual({ fetched: 1, recorded: 1, duplicates: 0, failed: 0 });

    const firstPass = auditRepository.listByTenant(tenantId);

    resetOutboxCursor();
    const replay = relay.runOnce();

    expect(replay).toEqual({ fetched: 1, recorded: 0, duplicates: 1, failed: 0 });
    expect(countAuditRows()).toBe(1);
    expect(auditRepository.listByTenant(tenantId)).toEqual(firstPass);
  });

  it('does not reprocess rows that were already published', () => {
    seedMilestone();
    relay.runOnce();

    expect(relay.runOnce()).toEqual({ fetched: 0, recorded: 0, duplicates: 0, failed: 0 });
    expect(countAuditRows()).toBe(1);
  });

  it('keeps audit reads scoped to the owning tenant', () => {
    const own = seedMilestone();
    const foreign = seedMilestone(otherTenantActor);
    relay.runOnce();

    expect(countAuditRows()).toBe(2);

    const ownEvents = auditRepository.listByTenant(tenantId);
    expect(ownEvents).toHaveLength(1);
    expect(ownEvents[0]?.entityId).toBe(own.milestone.id);

    const foreignEventId = ownEvents[0]?.eventId;
    expect(foreignEventId).toBeDefined();
    expect(auditRepository.findById(otherTenantId, foreignEventId as string)).toBeUndefined();
    expect(auditRepository.listByEntity(tenantId, foreign.milestone.id)).toEqual([]);
  });

  it('rejects updates and deletes against the audit store', () => {
    seedMilestone();
    relay.runOnce();

    expect(() => sqlite.prepare("UPDATE audit_events SET eventType = 'tampered'").run()).toThrow(
      /append-only/,
    );
    expect(() => sqlite.prepare('DELETE FROM audit_events').run()).toThrow(/append-only/);
    expect(countAuditRows()).toBe(1);
  });

  it('leaves a malformed outbox row unpublished and counts the failed attempt', () => {
    seedMilestone();
    const eventId = (
      sqlite.prepare('SELECT eventId FROM milestone_outbox_events').get() as { eventId: string }
    ).eventId;
    sqlite
      .prepare('UPDATE milestone_outbox_events SET afterState = ? WHERE eventId = ?')
      .run('not-json', eventId);

    const result = relay.runOnce();

    expect(result).toEqual({ fetched: 1, recorded: 0, duplicates: 0, failed: 1 });
    expect(countAuditRows()).toBe(0);
    expect(outboxRow(eventId)).toEqual({ publishedAt: null, attemptCount: 1 });
  });

  it('stops retrying an outbox row once the attempt cap is reached', () => {
    seedMilestone();
    const eventId = (
      sqlite.prepare('SELECT eventId FROM milestone_outbox_events').get() as { eventId: string }
    ).eventId;
    sqlite
      .prepare(
        'UPDATE milestone_outbox_events SET afterState = ?, attemptCount = ? WHERE eventId = ?',
      )
      .run('not-json', 5, eventId);

    expect(relay.runOnce()).toEqual({ fetched: 0, recorded: 0, duplicates: 0, failed: 0 });
  });
});
