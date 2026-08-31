import Database from 'better-sqlite3';
import { createProjectsDb } from '../src/projects/project.database';
import { ProjectRepository } from '../src/projects/project.repository';
import { ProjectService, type ProjectActorContext } from '../src/projects/project.service';
import { NotFoundError } from '../src/shared/errors';

describe('ProjectService', () => {
  let sqlite: Database.Database;
  let service: ProjectService;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const teamId = '33333333-3333-4333-8333-333333333333';
  const otherTeamId = '44444444-4444-4444-8444-444444444444';
  const ownerId = '55555555-5555-4555-8555-555555555555';
  const userId = '66666666-6666-4666-8666-666666666666';

  const actor: ProjectActorContext = { userId, tenantId };
  const otherTenantActor: ProjectActorContext = { userId, tenantId: otherTenantId };

  beforeEach(() => {
    sqlite = new Database(':memory:');
    service = new ProjectService(new ProjectRepository(createProjectsDb(sqlite)));
  });

  afterEach(() => {
    sqlite.close();
  });

  it('creates, updates, lists, and deletes a tenant-scoped project', () => {
    const project = service.create(actor, {
      teamId,
      name: 'Launch plan',
      description: 'Coordinate the release.',
      ownerId,
    });

    expect(project.status).toBe('planned');
    expect(project.tenantId).toBe(tenantId);
    expect(service.getByTeam(actor, teamId)).toEqual([project]);

    const updated = service.updateStatus(actor, project.id, 'active');

    expect(updated).toMatchObject({ id: project.id, status: 'active' });
    service.delete(actor, project.id);
    expect(service.getByTeam(actor, teamId)).toEqual([]);
  });

  it('does not expose projects across tenants or teams', () => {
    const project = service.create(actor, {
      teamId,
      name: 'Private work',
      description: 'Restricted scope.',
      ownerId,
    });

    expect(service.getByTeam(otherTenantActor, teamId)).toEqual([]);
    expect(service.getByTeam(actor, otherTeamId)).toEqual([]);
    expect(() => service.updateStatus(otherTenantActor, project.id, 'archived')).toThrow(
      NotFoundError,
    );
    expect(() => service.delete(otherTenantActor, project.id)).toThrow(NotFoundError);
    expect(service.getById(actor, project.id)).toEqual(project);
  });

  it('throws NotFoundError when reading, updating, or deleting an unknown project', () => {
    const unknownId = '77777777-7777-4777-8777-777777777777';

    expect(() => service.getById(actor, unknownId)).toThrow(NotFoundError);
    expect(() => service.updateStatus(actor, unknownId, 'active')).toThrow(NotFoundError);
    expect(() => service.delete(actor, unknownId)).toThrow(NotFoundError);
  });
});
