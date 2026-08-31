import Database from 'better-sqlite3';
import { createProjectsDb } from '../src/projects/project.database';
import { ProjectMemberRepository } from '../src/projects/project-member.repository';
import { ProjectMemberService } from '../src/projects/project-member.service';
import { ProjectRepository } from '../src/projects/project.repository';
import { ProjectService, type ProjectActorContext } from '../src/projects/project.service';
import { NotFoundError } from '../src/shared/errors';

describe('ProjectMemberService', () => {
  let sqlite: Database.Database;
  let memberService: ProjectMemberService;
  let projectService: ProjectService;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const teamId = '33333333-3333-4333-8333-333333333333';
  const ownerId = '55555555-5555-4555-8555-555555555555';
  const userId = '66666666-6666-4666-8666-666666666666';
  const memberUserId = '77777777-7777-4777-8777-777777777777';

  const actor: ProjectActorContext = { userId, tenantId };
  const otherTenantActor: ProjectActorContext = { userId, tenantId: otherTenantId };

  beforeEach(() => {
    sqlite = new Database(':memory:');
    const db = createProjectsDb(sqlite);
    const projectRepository = new ProjectRepository(db);
    projectService = new ProjectService(projectRepository);
    memberService = new ProjectMemberService(new ProjectMemberRepository(db), projectRepository);
  });

  afterEach(() => {
    sqlite.close();
  });

  function createProject() {
    return projectService.create(actor, { teamId, name: 'Launch plan', ownerId });
  }

  it('adds, lists, and removes a project member', () => {
    const project = createProject();

    const member = memberService.addMember(actor, project.id, {
      userId: memberUserId,
      channels: ['in_app', 'email'],
    });

    expect(member.channels).toEqual(['in_app', 'email']);
    expect(memberService.listMembers(actor, project.id)).toEqual([member]);

    memberService.removeMember(actor, project.id, memberUserId);
    expect(memberService.listMembers(actor, project.id)).toEqual([]);
  });

  it('resolves recipients with their permitted channels', () => {
    const project = createProject();
    memberService.addMember(actor, project.id, { userId: memberUserId, channels: ['email'] });

    expect(memberService.resolveRecipients(tenantId, project.id)).toEqual([
      { userId: memberUserId, channels: ['email'] },
    ]);
  });

  it('does not expose membership across tenants', () => {
    const project = createProject();
    memberService.addMember(actor, project.id, { userId: memberUserId, channels: ['in_app'] });

    expect(() => memberService.listMembers(otherTenantActor, project.id)).toThrow(NotFoundError);
    expect(memberService.resolveRecipients(otherTenantId, project.id)).toEqual([]);
    expect(() => memberService.removeMember(otherTenantActor, project.id, memberUserId)).toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError when removing a member who was never added', () => {
    const project = createProject();
    expect(() => memberService.removeMember(actor, project.id, memberUserId)).toThrow(
      NotFoundError,
    );
  });
});
