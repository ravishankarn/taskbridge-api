import Database from 'better-sqlite3';
import { createProjectsDb } from '../src/projects/project.database';
import { MilestoneOutboxRepository } from '../src/projects/milestone-outbox.repository';
import { MilestoneRepository } from '../src/projects/milestone.repository';
import { MilestoneService } from '../src/projects/milestone.service';
import { ProjectRepository } from '../src/projects/project.repository';
import { ProjectService, type ProjectActorContext } from '../src/projects/project.service';
import { ConflictError, NotFoundError } from '../src/shared/errors';

describe('MilestoneService', () => {
  let sqlite: Database.Database;
  let milestoneService: MilestoneService;
  let projectService: ProjectService;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const teamId = '33333333-3333-4333-8333-333333333333';
  const ownerId = '55555555-5555-4555-8555-555555555555';
  const userId = '66666666-6666-4666-8666-666666666666';

  const actor: ProjectActorContext = { userId, tenantId };
  const otherTenantActor: ProjectActorContext = { userId, tenantId: otherTenantId };

  function countOutboxRows(): number {
    const row = sqlite
      .prepare('SELECT COUNT(*) as count FROM milestone_outbox_events')
      .get() as { count: number };
    return row.count;
  }

  beforeEach(() => {
    sqlite = new Database(':memory:');
    const db = createProjectsDb(sqlite);
    const projectRepository = new ProjectRepository(db);
    projectService = new ProjectService(projectRepository);
    milestoneService = new MilestoneService(
      sqlite,
      new MilestoneRepository(db),
      new MilestoneOutboxRepository(db),
      projectRepository,
    );
  });

  afterEach(() => {
    sqlite.close();
  });

  function createProject() {
    return projectService.create(actor, { teamId, name: 'Launch plan', ownerId });
  }

  it('creates a milestone and writes a matching outbox event transactionally', () => {
    const project = createProject();

    const milestone = milestoneService.create(actor, project.id, { title: 'Design review' });

    expect(milestone.status).toBe('open');
    expect(countOutboxRows()).toBe(1);

    const row = sqlite
      .prepare('SELECT eventType, changedFields, beforeState FROM milestone_outbox_events')
      .get() as { eventType: string; changedFields: string; beforeState: string | null };
    expect(row.eventType).toBe('milestone.created');
    expect(JSON.parse(row.changedFields)).toEqual([]);
    expect(row.beforeState).toBeNull();
  });

  it('updates a milestone, records changed fields, and appends a second outbox event', () => {
    const project = createProject();
    const milestone = milestoneService.create(actor, project.id, { title: 'Design review' });

    const updated = milestoneService.update(actor, project.id, milestone.id, {
      title: 'Design review v2',
    });

    expect(updated.title).toBe('Design review v2');
    expect(countOutboxRows()).toBe(2);

    const rows = sqlite
      .prepare('SELECT eventType, changedFields FROM milestone_outbox_events ORDER BY rowid')
      .all() as { eventType: string; changedFields: string }[];
    expect(rows[1]?.eventType).toBe('milestone.updated');
    expect(JSON.parse(rows[1]?.changedFields ?? '[]')).toEqual(['title']);
  });

  it('closes a milestone and rejects further updates or double-close', () => {
    const project = createProject();
    const milestone = milestoneService.create(actor, project.id, { title: 'Design review' });

    const closed = milestoneService.close(actor, project.id, milestone.id);
    expect(closed.status).toBe('closed');
    expect(countOutboxRows()).toBe(2);

    expect(() => milestoneService.close(actor, project.id, milestone.id)).toThrow(ConflictError);
    expect(() => milestoneService.update(actor, project.id, milestone.id, { title: 'x' })).toThrow(
      ConflictError,
    );
    expect(countOutboxRows()).toBe(2);
  });

  it('does not expose milestones across tenants and rejects unknown projects', () => {
    const project = createProject();
    const milestone = milestoneService.create(actor, project.id, { title: 'Design review' });

    expect(() => milestoneService.getById(otherTenantActor, project.id, milestone.id)).toThrow(
      NotFoundError,
    );
    expect(() =>
      milestoneService.create(actor, '77777777-7777-4777-8777-777777777777', { title: 'x' }),
    ).toThrow(NotFoundError);
  });

  it('rolls back the milestone write if the outbox insert fails, leaving no partial state', () => {
    const project = createProject();
    const milestone = milestoneService.create(actor, project.id, { title: 'Design review' });
    const rowsBefore = countOutboxRows();

    // Force the transactional outbox insert to fail so the milestone update must also roll back.
    jest
      .spyOn(MilestoneOutboxRepository.prototype, 'insert')
      .mockImplementationOnce(() => {
        throw new Error('simulated outbox failure');
      });

    expect(() =>
      milestoneService.update(actor, project.id, milestone.id, { title: 'Should not persist' }),
    ).toThrow('simulated outbox failure');

    expect(countOutboxRows()).toBe(rowsBefore);
    expect(milestoneService.getById(actor, project.id, milestone.id).title).toBe('Design review');

    jest.restoreAllMocks();
  });
});
