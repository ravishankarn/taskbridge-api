import Database from 'better-sqlite3';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../src/middleware/auth.middleware';
import { requirePermission } from '../src/middleware/authorize.middleware';
import { AuditEventRepository } from '../src/notifications/audit-event.repository';
import { MilestoneAuditRelay } from '../src/notifications/audit-relay';
import { MilestoneOutboxReader } from '../src/notifications/milestone-outbox.reader';
import { createNotificationsDb } from '../src/notifications/notification.database';
import { NotificationDispatchRepository } from '../src/notifications/notification-dispatch.repository';
import { NotificationDispatcher } from '../src/notifications/notification-dispatcher';
import { NotificationController } from '../src/notifications/notification.controller';
import type { Notification, NotificationQuery } from '../src/notifications/notification.model';
import { NotificationRepository } from '../src/notifications/notification.repository';
import { NotificationService } from '../src/notifications/notification.service';
import { MilestoneOutboxRepository } from '../src/projects/milestone-outbox.repository';
import { MilestoneRepository } from '../src/projects/milestone.repository';
import { MilestoneService } from '../src/projects/milestone.service';
import { createProjectsDb } from '../src/projects/project.database';
import { ProjectMemberRepository } from '../src/projects/project-member.repository';
import { ProjectMemberService } from '../src/projects/project-member.service';
import { ProjectRepository } from '../src/projects/project.repository';
import { ProjectService, type ProjectActorContext } from '../src/projects/project.service';
import { AuthorizationError, NotFoundError } from '../src/shared/errors';
import { AUDIT_PERMISSIONS, NOTIFICATION_PERMISSIONS } from '../src/shared/permissions';

describe('In-app notifications', () => {
  let sqlite: Database.Database;
  let projectService: ProjectService;
  let memberService: ProjectMemberService;
  let milestoneService: MilestoneService;
  let relay: MilestoneAuditRelay;
  let dispatcher: NotificationDispatcher;
  let notificationRepository: NotificationRepository;
  let notificationService: NotificationService;
  let controller: NotificationController;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const teamId = '33333333-3333-4333-8333-333333333333';
  const ownerId = '44444444-4444-4444-8444-444444444444';
  const actorUserId = '55555555-5555-4555-8555-555555555555';
  const memberOne = '66666666-6666-4666-8666-666666666666';
  const memberTwo = '77777777-7777-4777-8777-777777777777';
  const outsiderId = '88888888-8888-4888-8888-888888888888';

  const actor: ProjectActorContext = { userId: actorUserId, tenantId };
  const otherTenantActor: ProjectActorContext = { userId: actorUserId, tenantId: otherTenantId };

  function createResponse(): { res: Response; body: () => unknown } {
    let captured: unknown;
    const res = {
      status() {
        return this;
      },
      json(payload: unknown) {
        captured = payload;
        return this;
      },
    } as unknown as Response;
    return { res, body: () => captured };
  }

  function createRequest(
    auth: AuthenticatedRequest['auth'],
    query: Record<string, unknown> = {},
    params: Record<string, string> = {},
  ): AuthenticatedRequest {
    return { auth, query, params } as unknown as AuthenticatedRequest;
  }

  beforeEach(() => {
    sqlite = new Database(':memory:');
    const projectsDb = createProjectsDb(sqlite);
    const notificationsDb = createNotificationsDb(sqlite);

    const projectRepository = new ProjectRepository(projectsDb);
    projectService = new ProjectService(projectRepository);
    memberService = new ProjectMemberService(
      new ProjectMemberRepository(projectsDb),
      projectRepository,
    );
    milestoneService = new MilestoneService(
      sqlite,
      new MilestoneRepository(projectsDb),
      new MilestoneOutboxRepository(projectsDb),
      projectRepository,
    );

    relay = new MilestoneAuditRelay(
      sqlite,
      new MilestoneOutboxReader(notificationsDb),
      new AuditEventRepository(notificationsDb),
    );

    notificationRepository = new NotificationRepository(notificationsDb);
    dispatcher = new NotificationDispatcher(
      sqlite,
      new NotificationDispatchRepository(notificationsDb),
      notificationRepository,
      memberService,
    );
    notificationService = new NotificationService(notificationRepository);
    controller = new NotificationController(notificationService);
  });

  afterEach(() => {
    sqlite.close();
  });

  function seedProjectWithMembers(seedActor: ProjectActorContext = actor) {
    const project = projectService.create(seedActor, { teamId, name: 'Launch plan', ownerId });
    memberService.addMember(seedActor, project.id, { userId: memberOne, channels: ['in_app'] });
    memberService.addMember(seedActor, project.id, { userId: memberTwo, channels: ['in_app'] });
    memberService.addMember(seedActor, project.id, {
      userId: seedActor.userId,
      channels: ['in_app'],
    });
    return project;
  }

  function listOwn(userId: string, query: Partial<NotificationQuery> = {}): Notification[] {
    return notificationService.list({ userId, tenantId }, { limit: 50, ...query }).items;
  }

  function firstOwned(userId: string): Notification {
    const [item] = listOwn(userId);
    if (!item) {
      throw new Error(`expected a notification for ${userId}`);
    }
    return item;
  }

  function firstMilestoneId(): string {
    const row = sqlite.prepare('SELECT id FROM milestones LIMIT 1').get() as { id: string };
    return row.id;
  }

  it('creates one notification per project member from an audited event, excluding the actor', () => {
    const project = seedProjectWithMembers();
    milestoneService.create(actor, project.id, { title: 'Design review' });
    relay.runOnce();

    const result = dispatcher.runOnce();

    expect(result).toEqual({ fetched: 1, created: 2, duplicates: 0, failed: 0 });
    expect(listOwn(memberOne)).toHaveLength(1);
    expect(listOwn(memberTwo)).toHaveLength(1);
    expect(listOwn(actorUserId)).toHaveLength(0);

    const notification = listOwn(memberOne)[0];
    expect(notification?.channel).toBe('in_app');
    expect(notification?.status).toBe('unread');
    expect(notification?.readAt).toBeNull();
    expect(notification?.projectId).toBe(project.id);
    expect(notification?.eventType).toBe('milestone.created');
    expect(notification?.tenantId).toBe(tenantId);
  });

  it('does not create duplicates when dispatch is replayed', () => {
    const project = seedProjectWithMembers();
    milestoneService.create(actor, project.id, { title: 'Design review' });
    relay.runOnce();
    dispatcher.runOnce();

    expect(dispatcher.runOnce()).toEqual({ fetched: 0, created: 0, duplicates: 0, failed: 0 });

    // Force a replay by clearing the dispatch marker; the unique index must still hold.
    sqlite.prepare('DELETE FROM notification_dispatch_state').run();
    expect(dispatcher.runOnce()).toEqual({ fetched: 1, created: 0, duplicates: 2, failed: 0 });
    expect(listOwn(memberOne)).toHaveLength(1);
  });

  it('picks up events that were audited before notification dispatch existed', () => {
    const project = seedProjectWithMembers();
    milestoneService.create(actor, project.id, { title: 'Design review' });
    milestoneService.close(actor, project.id, firstMilestoneId());

    // The relay has already published both outbox rows, so publishedAt cannot be the source.
    relay.runOnce();
    const unpublished = sqlite
      .prepare('SELECT COUNT(*) as count FROM milestone_outbox_events WHERE publishedAt IS NULL')
      .get() as { count: number };
    expect(unpublished.count).toBe(0);

    const result = dispatcher.runOnce();

    expect(result.fetched).toBe(2);
    expect(result.created).toBe(4);
    expect(listOwn(memberOne)).toHaveLength(2);
  });

  it('lists only the calling user own notifications', () => {
    const project = seedProjectWithMembers();
    milestoneService.create(actor, project.id, { title: 'Design review' });
    relay.runOnce();
    dispatcher.runOnce();

    const { res, body } = createResponse();
    const next = jest.fn();
    controller.list(createRequest({ userId: memberOne, tenantId, role: 'member' }), res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = body() as { data: { items: Notification[] } };
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items.every((item) => item.recipientUserId === memberOne)).toBe(true);
    expect(listOwn(outsiderId)).toEqual([]);
  });

  it('marks a notification read for its owner and is idempotent', () => {
    const project = seedProjectWithMembers();
    milestoneService.create(actor, project.id, { title: 'Design review' });
    relay.runOnce();
    dispatcher.runOnce();

    const target = firstOwned(memberOne);

    const { res, body } = createResponse();
    const next = jest.fn();
    controller.markRead(
      createRequest({ userId: memberOne, tenantId, role: 'member' }, {}, { id: target.id }),
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    const payload = body() as { data: Notification };
    expect(payload.data.status).toBe('read');
    expect(payload.data.readAt).toEqual(expect.any(String));

    const again = notificationService.markRead({ userId: memberOne, tenantId }, target.id);
    expect(again.status).toBe('read');
    expect(again.readAt).toBe(payload.data.readAt);

    expect(listOwn(memberOne, { status: 'unread' })).toEqual([]);
    expect(listOwn(memberOne, { status: 'read' })).toHaveLength(1);
  });

  it('refuses to read or mark another user notification', () => {
    const project = seedProjectWithMembers();
    milestoneService.create(actor, project.id, { title: 'Design review' });
    relay.runOnce();
    dispatcher.runOnce();

    const target = firstOwned(memberOne);

    expect(() => notificationService.markRead({ userId: memberTwo, tenantId }, target.id)).toThrow(
      NotFoundError,
    );
    expect(notificationRepository.findOwned(tenantId, memberTwo, target.id)).toBeUndefined();
    expect(firstOwned(memberTwo).id).not.toBe(target.id);

    // The owner's notification is untouched by the failed attempt.
    expect(firstOwned(memberOne).status).toBe('unread');
  });

  it('refuses cross-tenant notification access', () => {
    const project = seedProjectWithMembers();
    milestoneService.create(actor, project.id, { title: 'Design review' });
    relay.runOnce();
    dispatcher.runOnce();

    const target = firstOwned(memberOne);

    const foreignActor = { userId: memberOne, tenantId: otherTenantId };
    expect(notificationService.list(foreignActor, { limit: 50 }).items).toEqual([]);
    expect(() => notificationService.markRead(foreignActor, target.id)).toThrow(NotFoundError);
    expect(firstOwned(memberOne).status).toBe('unread');
  });

  it('keeps dispatch tenant scope from the audited event, not from another tenant project', () => {
    const project = seedProjectWithMembers();
    seedProjectWithMembers(otherTenantActor);
    milestoneService.create(actor, project.id, { title: 'Design review' });
    relay.runOnce();
    dispatcher.runOnce();

    const rows = sqlite.prepare('SELECT DISTINCT tenantId FROM notifications').all() as {
      tenantId: string;
    }[];
    expect(rows).toEqual([{ tenantId }]);
  });

  it('grants notifications:read to every tenant role but keeps audit:read restricted', () => {
    const res = {} as Response;

    for (const role of ['admin', 'manager', 'member'] as const) {
      const next = jest.fn();
      requirePermission(NOTIFICATION_PERMISSIONS.READ)(
        createRequest({ userId: memberOne, tenantId, role }),
        res,
        next,
      );
      expect(next).toHaveBeenCalledWith();
    }

    const auditNext = jest.fn();
    requirePermission(AUDIT_PERMISSIONS.READ)(
      createRequest({ userId: memberOne, tenantId, role: 'member' }),
      res,
      auditNext,
    );
    expect(auditNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });

  it('rejects invalid notification query parameters', () => {
    for (const query of [{ limit: '0' }, { status: 'archived' }, { unexpected: 'x' }]) {
      const next = jest.fn();
      const { res } = createResponse();
      controller.list(
        createRequest({ userId: memberOne, tenantId, role: 'member' }, query),
        res,
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.anything());
    }

    const badIdNext = jest.fn();
    const { res } = createResponse();
    controller.markRead(
      createRequest({ userId: memberOne, tenantId, role: 'member' }, {}, { id: 'not-a-uuid' }),
      res,
      badIdNext,
    );
    expect(badIdNext).toHaveBeenCalledWith(expect.anything());
  });
});
