import Database from 'better-sqlite3';
import { ProjectService } from '../src/projects/project.service';

describe('ProjectService', () => {
  let database: Database.Database;
  let service: ProjectService;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const teamId = '33333333-3333-4333-8333-333333333333';
  const otherTeamId = '44444444-4444-4444-8444-444444444444';
  const ownerId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    database = new Database(':memory:');
    service = new ProjectService(database);
  });

  afterEach(() => {
    database.close();
  });

  it('creates, updates, lists, and deletes a tenant-scoped project', () => {
    const project = service.create({
      tenantId,
      teamId,
      name: 'Launch plan',
      description: 'Coordinate the release.',
      ownerId,
    });

    expect(project.status).toBe('planned');
    expect(service.getByTeam(tenantId, teamId)).toEqual([project]);

    const updated = service.updateStatus(tenantId, project.id, 'active');

    expect(updated).toMatchObject({ id: project.id, status: 'active' });
    expect(service.delete(tenantId, project.id)).toBe(true);
    expect(service.getByTeam(tenantId, teamId)).toEqual([]);
  });

  it('does not expose projects across tenants or teams', () => {
    const project = service.create({
      tenantId,
      teamId,
      name: 'Private work',
      description: 'Restricted scope.',
      ownerId,
    });

    expect(service.getByTeam(otherTenantId, teamId)).toEqual([]);
    expect(service.getByTeam(tenantId, otherTeamId)).toEqual([]);
    expect(service.updateStatus(otherTenantId, project.id, 'archived')).toBeUndefined();
    expect(service.delete(otherTenantId, project.id)).toBe(false);
    expect(service.findById(tenantId, project.id)).toEqual(project);
  });
});
