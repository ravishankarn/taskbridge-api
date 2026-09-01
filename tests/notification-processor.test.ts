import Database from 'better-sqlite3';
import { AuditEventRepository } from '../src/notifications/audit-event.repository';
import { AuditEventService } from '../src/notifications/audit-event.service';
import { MilestoneAuditRelay } from '../src/notifications/audit-relay';
import { MilestoneOutboxReader } from '../src/notifications/milestone-outbox.reader';
import { createNotificationsDb } from '../src/notifications/notification.database';
import { NotificationDispatchRepository } from '../src/notifications/notification-dispatch.repository';
import { NotificationDispatcher } from '../src/notifications/notification-dispatcher';
import {
  NotificationProcessor,
  createNotificationProcessor,
} from '../src/notifications/notification-processor';
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
import { NotFoundError } from '../src/shared/errors';

describe('Notification & Audit Service hardening', () => {
  let sqlite: Database.Database;
  let projectService: ProjectService;
  let memberService: ProjectMemberService;
  let milestoneService: MilestoneService;
  let auditRepository: AuditEventRepository;
  let auditService: AuditEventService;
  let notificationRepository: NotificationRepository;
  let notificationService: NotificationService;
  let processor: NotificationProcessor;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const teamId = '33333333-3333-4333-8333-333333333333';
  const ownerId = '44444444-4444-4444-8444-444444444444';
  const adminId = '55555555-5555-4555-8555-555555555555';
  const managerId = '66666666-6666-4666-8666-666666666666';
  const memberId = '77777777-7777-4777-8777-777777777777';

  const actor: ProjectActorContext = { userId: adminId, tenantId };

  function countAudit(): number {
    return (sqlite.prepare('SELECT COUNT(*) as c FROM audit_events').get() as { c: number }).c;
  }

  function countNotifications(): number {
    return (sqlite.prepare('SELECT COUNT(*) as c FROM notifications').get() as { c: number }).c;
  }

  function countDispatchState(): number {
    return (
      sqlite.prepare('SELECT COUNT(*) as c FROM notification_dispatch_state').get() as { c: number }
    ).c;
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

    auditRepository = new AuditEventRepository(notificationsDb);
    auditService = new AuditEventService(auditRepository, memberService);
    notificationRepository = new NotificationRepository(notificationsDb);
    notificationService = new NotificationService(notificationRepository);
    processor = createNotificationProcessor(sqlite, { intervalMs: 10_000 });
  });

  afterEach(() => {
    processor.stop();
    sqlite.close();
  });

  function seedProject(name = 'Launch plan') {
    const project = projectService.create(actor, { teamId, name, ownerId });
    memberService.addMember(actor, project.id, { userId: memberId, channels: ['in_app'] });
    return project;
  }

  describe('processor wiring', () => {
    it('audits and dispatches in a single tick', () => {
      const project = seedProject();
      milestoneService.create(actor, project.id, { title: 'Design review' });

      const result = processor.runOnce();

      expect(result.audit).toEqual({ fetched: 1, recorded: 1, duplicates: 0, failed: 0 });
      expect(result.notifications).toEqual({ fetched: 1, created: 1, duplicates: 0, failed: 0 });
      expect(countAudit()).toBe(1);
      expect(countNotifications()).toBe(1);
    });

    it('start and stop are idempotent and do not hold the event loop', () => {
      expect(processor.isRunning).toBe(false);

      processor.start();
      processor.start();
      expect(processor.isRunning).toBe(true);

      processor.stop();
      processor.stop();
      expect(processor.isRunning).toBe(false);
    });

    it('runs scheduled ticks without overlapping', () => {
      jest.useFakeTimers();
      try {
        const project = seedProject();
        milestoneService.create(actor, project.id, { title: 'Design review' });

        processor.start();
        jest.advanceTimersByTime(30_000);

        expect(countAudit()).toBe(1);
        expect(countNotifications()).toBe(1);
        expect(countDispatchState()).toBe(1);
      } finally {
        processor.stop();
        jest.useRealTimers();
      }
    });
  });

  describe('crash and replay safety', () => {
    it('replays cleanly when the process dies between auditing and dispatching', () => {
      const project = seedProject();
      milestoneService.create(actor, project.id, { title: 'Design review' });

      const relay = new MilestoneAuditRelay(
        sqlite,
        new MilestoneOutboxReader(createNotificationsDb(sqlite)),
        auditRepository,
      );
      relay.runOnce();
      expect(countAudit()).toBe(1);
      expect(countNotifications()).toBe(0);

      // Restart: a full tick must complete the work without duplicating the audit row.
      processor.runOnce();
      expect(countAudit()).toBe(1);
      expect(countNotifications()).toBe(1);

      processor.runOnce();
      expect(countAudit()).toBe(1);
      expect(countNotifications()).toBe(1);
    });

    it('does not mark dispatch complete when notification insertion fails', () => {
      const project = seedProject();
      milestoneService.create(actor, project.id, { title: 'Design review' });
      processor.runOnce();

      // Rebuild a dispatcher whose notification write always fails.
      const notificationsDb = createNotificationsDb(sqlite);
      const failing = new NotificationRepository(notificationsDb);
      jest.spyOn(failing, 'insertIfAbsent').mockImplementation(() => {
        throw new Error('write failed');
      });

      sqlite.prepare('DELETE FROM notification_dispatch_state').run();
      sqlite.prepare('DELETE FROM notifications').run();

      const dispatcher = new NotificationDispatcher(
        sqlite,
        new NotificationDispatchRepository(notificationsDb),
        failing,
        memberService,
      );

      expect(dispatcher.runOnce()).toEqual({
        fetched: 1,
        created: 0,
        duplicates: 0,
        failed: 1,
      });
      expect(countDispatchState()).toBe(0);
      expect(countNotifications()).toBe(0);

      // With the failure removed the event is still pending and is delivered exactly once.
      jest.restoreAllMocks();
      expect(processor.runOnce().notifications.created).toBe(1);
      expect(countNotifications()).toBe(1);
      expect(countDispatchState()).toBe(1);
    });
  });

  describe('resource-level audit authorization', () => {
    it('limits a manager to audit events for projects they belong to', () => {
      const visible = seedProject('Visible');
      const hidden = seedProject('Hidden');
      memberService.addMember(actor, visible.id, { userId: managerId, channels: ['in_app'] });
      milestoneService.create(actor, visible.id, { title: 'Visible milestone' });
      milestoneService.create(actor, hidden.id, { title: 'Hidden milestone' });
      processor.runOnce();

      const manager = { userId: managerId, tenantId, role: 'manager' as const };
      const admin = { userId: adminId, tenantId, role: 'admin' as const };

      const managerView = auditService.list(manager, { limit: 50 }).items;
      expect(managerView).toHaveLength(1);
      expect(managerView[0]?.projectId).toBe(visible.id);

      expect(auditService.list(admin, { limit: 50 })).toHaveProperty('items.length', 2);

      const hiddenEvent = auditService
        .list(admin, { limit: 50 })
        .items.find((event) => event.projectId === hidden.id);
      expect(hiddenEvent).toBeDefined();
      expect(() => auditService.getById(manager, hiddenEvent?.eventId ?? '')).toThrow(
        NotFoundError,
      );
      expect(auditService.list(manager, { projectId: hidden.id, limit: 50 }).items).toEqual([]);
    });

    it('returns nothing for a manager with no project memberships', () => {
      const project = seedProject();
      milestoneService.create(actor, project.id, { title: 'Design review' });
      processor.runOnce();

      const stranger = {
        userId: '88888888-8888-4888-8888-888888888888',
        tenantId,
        role: 'manager' as const,
      };
      expect(auditService.list(stranger, { limit: 50 }).items).toEqual([]);
    });
  });

  describe('redaction and snapshot limits', () => {
    it('redacts secrets from audit snapshots and metadata', () => {
      const project = seedProject();
      milestoneService.create(actor, project.id, { title: 'Design review' });

      sqlite
        .prepare('UPDATE milestone_outbox_events SET afterState = ?, metadata = ?')
        .run(
          JSON.stringify({ title: 'Design review', password: 'hunter2', token: 'abc.def' }),
          JSON.stringify({ apiKey: 'live-key', source: 'milestone-service' }),
        );

      processor.runOnce();

      const stored = auditRepository.listByTenant(tenantId);
      expect(stored).toHaveLength(1);
      expect(stored[0]?.after).toEqual({
        title: 'Design review',
        password: '[REDACTED]',
        token: '[REDACTED]',
      });
      expect(stored[0]?.metadata).toEqual({
        apiKey: '[REDACTED]',
        source: 'milestone-service',
      });

      const raw = sqlite.prepare('SELECT afterState, metadata FROM audit_events').get() as {
        afterState: string;
        metadata: string;
      };
      expect(raw.afterState).not.toContain('hunter2');
      expect(raw.metadata).not.toContain('live-key');
    });

    it('rejects an audit snapshot larger than 1 MiB', () => {
      const project = seedProject();
      milestoneService.create(actor, project.id, { title: 'Design review' });

      const oversized = JSON.stringify({ blob: 'x'.repeat(1_100_000) });
      sqlite.prepare('UPDATE milestone_outbox_events SET afterState = ?').run(oversized);

      const result = processor.runOnce();

      expect(result.audit.failed).toBe(1);
      expect(countAudit()).toBe(0);
      expect(countNotifications()).toBe(0);

      const row = sqlite
        .prepare('SELECT publishedAt, attemptCount FROM milestone_outbox_events')
        .get() as { publishedAt: string | null; attemptCount: number };
      expect(row.publishedAt).toBeNull();
      expect(row.attemptCount).toBe(1);
    });

    it('does not echo stored payload fragments in failure logs', () => {
      const project = seedProject();
      milestoneService.create(actor, project.id, { title: 'Design review' });
      sqlite
        .prepare('UPDATE milestone_outbox_events SET afterState = ?')
        .run('{"password":"hunter2"');

      const written: string[] = [];
      const spy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
          written.push(chunk.toString());
          return true;
        });

      try {
        processor.runOnce();
      } finally {
        spy.mockRestore();
      }

      expect(written.join('')).not.toContain('hunter2');
    });
  });

  describe('notification ownership', () => {
    it('scopes list and mark-read to the owning user and tenant in SQL', () => {
      const project = seedProject();
      milestoneService.create(actor, project.id, { title: 'Design review' });
      processor.runOnce();

      const owner = { userId: memberId, tenantId };
      const own = notificationService.list(owner, { limit: 50 }).items;
      expect(own).toHaveLength(1);

      const target = own[0];
      expect(target).toBeDefined();
      const notificationId = target?.id ?? '';

      expect(notificationRepository.findOwned(tenantId, managerId, notificationId)).toBeUndefined();
      expect(
        notificationRepository.findOwned(
          '22222222-2222-4222-8222-222222222222',
          memberId,
          notificationId,
        ),
      ).toBeUndefined();
      expect(() =>
        notificationService.markRead({ userId: managerId, tenantId }, notificationId),
      ).toThrow(NotFoundError);
      expect(notificationRepository.findOwned(tenantId, memberId, notificationId)?.status).toBe(
        'unread',
      );
    });
  });
});
