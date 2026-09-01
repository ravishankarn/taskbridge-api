import Database from 'better-sqlite3';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../src/middleware/auth.middleware';
import { requirePermission } from '../src/middleware/authorize.middleware';
import { AuditEventController } from '../src/notifications/audit-event.controller';
import type { AuditEvent } from '../src/notifications/audit-event.model';
import { AuditEventRepository } from '../src/notifications/audit-event.repository';
import { AuditEventService } from '../src/notifications/audit-event.service';
import { createNotificationsDb } from '../src/notifications/notification.database';
import { AuthorizationError, NotFoundError } from '../src/shared/errors';
import { AUDIT_PERMISSIONS } from '../src/shared/permissions';

describe('Audit event read APIs', () => {
  let sqlite: Database.Database;
  let repository: AuditEventRepository;
  let service: AuditEventService;
  let controller: AuditEventController;

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const projectA = '33333333-3333-4333-8333-333333333333';
  const projectB = '44444444-4444-4444-8444-444444444444';
  const milestoneA = '55555555-5555-4555-8555-555555555555';
  const milestoneB = '66666666-6666-4666-8666-666666666666';
  const actorId = '77777777-7777-4777-8777-777777777777';
  const userId = '88888888-8888-4888-8888-888888888888';

  const actor = { userId, tenantId, role: 'admin' as const };

  // Admin actors are unrestricted, so the directory is only consulted for non-admin roles.
  const projectAccess = {
    listAuthorizedProjectIds: jest.fn<string[], [string, string]>(() => []),
  };

  function seed(overrides: Partial<AuditEvent> & Pick<AuditEvent, 'eventId'>): AuditEvent {
    const event: AuditEvent = {
      tenantId,
      eventType: 'milestone.created',
      entityType: 'milestone',
      entityId: milestoneA,
      projectId: projectA,
      actorId,
      occurredAt: '2026-01-01T00:00:00.000Z',
      recordedAt: '2026-01-01T00:00:01.000Z',
      before: null,
      after: { status: 'open' },
      changedFields: [],
      metadata: {},
      ...overrides,
    };
    repository.insertIfAbsent(event);
    return event;
  }

  function eventId(suffix: string): string {
    return `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa${suffix}`;
  }

  function createResponse(): { res: Response; body: () => unknown; status: () => number } {
    let captured: unknown;
    let statusCode = 200;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        captured = payload;
        return this;
      },
    } as unknown as Response;
    return { res, body: () => captured, status: () => statusCode };
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
    repository = new AuditEventRepository(createNotificationsDb(sqlite));
    projectAccess.listAuthorizedProjectIds.mockReset();
    projectAccess.listAuthorizedProjectIds.mockReturnValue([]);
    service = new AuditEventService(repository, projectAccess);
    controller = new AuditEventController(service);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns a tenant-scoped page of audit events, newest first', () => {
    seed({ eventId: eventId('001'), occurredAt: '2026-01-01T00:00:00.000Z' });
    seed({
      eventId: eventId('002'),
      occurredAt: '2026-01-02T00:00:00.000Z',
      eventType: 'milestone.closed',
    });
    seed({ eventId: eventId('003'), tenantId: otherTenantId });

    const { res, body } = createResponse();
    const next = jest.fn();
    controller.list(createRequest({ userId, tenantId, role: 'admin' }), res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = body() as {
      success: boolean;
      data: { items: AuditEvent[]; pagination: { hasMore: boolean; nextCursor: string | null } };
    };
    expect(payload.success).toBe(true);
    expect(payload.data.items.map((item) => item.eventId)).toEqual([
      eventId('002'),
      eventId('001'),
    ]);
    expect(payload.data.items.every((item) => item.tenantId === tenantId)).toBe(true);
    expect(payload.data.pagination).toEqual({ limit: 50, hasMore: false, nextCursor: null });
  });

  it('filters by projectId, entityId, eventType, and date range', () => {
    seed({ eventId: eventId('010'), occurredAt: '2026-01-01T00:00:00.000Z' });
    seed({ eventId: eventId('011'), projectId: projectB, entityId: milestoneB });
    seed({
      eventId: eventId('012'),
      eventType: 'milestone.closed',
      occurredAt: '2026-03-01T00:00:00.000Z',
    });

    expect(
      service.list(actor, { projectId: projectB, limit: 50 }).items.map((e) => e.eventId),
    ).toEqual([eventId('011')]);

    expect(
      service.list(actor, { entityId: milestoneB, limit: 50 }).items.map((e) => e.eventId),
    ).toEqual([eventId('011')]);

    expect(
      service.list(actor, { eventType: 'milestone.closed', limit: 50 }).items.map((e) => e.eventId),
    ).toEqual([eventId('012')]);

    expect(
      service
        .list(actor, {
          from: '2026-02-01T00:00:00.000Z',
          to: '2026-04-01T00:00:00.000Z',
          limit: 50,
        })
        .items.map((e) => e.eventId),
    ).toEqual([eventId('012')]);
  });

  it('paginates with an opaque cursor without leaking other tenants', () => {
    seed({ eventId: eventId('020'), occurredAt: '2026-01-01T00:00:00.000Z' });
    seed({ eventId: eventId('021'), occurredAt: '2026-01-02T00:00:00.000Z' });
    seed({
      eventId: eventId('022'),
      tenantId: otherTenantId,
      occurredAt: '2026-01-03T00:00:00.000Z',
    });

    const first = service.list(actor, { limit: 1 });
    expect(first.items.map((e) => e.eventId)).toEqual([eventId('021')]);
    expect(first.pagination.hasMore).toBe(true);
    expect(first.pagination.nextCursor).toEqual(expect.any(String));

    const second = service.list(actor, { limit: 1, cursor: first.pagination.nextCursor as string });
    expect(second.items.map((e) => e.eventId)).toEqual([eventId('020')]);
    expect(second.pagination.hasMore).toBe(false);
    expect(second.pagination.nextCursor).toBeNull();
  });

  it('fetches a single audit event by id', () => {
    seed({ eventId: eventId('030') });
    projectAccess.listAuthorizedProjectIds.mockReturnValue([projectA]);

    const { res, body } = createResponse();
    const next = jest.fn();
    controller.getById(
      createRequest({ userId, tenantId, role: 'manager' }, {}, { eventId: eventId('030') }),
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    const payload = body() as { data: AuditEvent };
    expect(payload.data.eventId).toBe(eventId('030'));
    expect(payload.data.after).toEqual({ status: 'open' });
  });

  it('denies audit reads to members and allows managers and admins', () => {
    const res = {} as Response;

    const memberNext = jest.fn();
    requirePermission(AUDIT_PERMISSIONS.READ)(
      createRequest({ userId, tenantId, role: 'member' }),
      res,
      memberNext,
    );
    expect(memberNext).toHaveBeenCalledWith(expect.any(AuthorizationError));

    for (const role of ['manager', 'admin'] as const) {
      const next = jest.fn();
      requirePermission(AUDIT_PERMISSIONS.READ)(
        createRequest({ userId, tenantId, role }),
        res,
        next,
      );
      expect(next).toHaveBeenCalledWith();
    }
  });

  it('does not expose another tenant audit event by id or by crafted filters', () => {
    seed({ eventId: eventId('040'), tenantId: otherTenantId, projectId: projectB });

    expect(() => service.getById(actor, eventId('040'))).toThrow(NotFoundError);
    expect(service.list(actor, { projectId: projectB, limit: 50 }).items).toEqual([]);
    expect(service.list(actor, { limit: 50 }).items).toEqual([]);

    const foreignCursor = Buffer.from(
      JSON.stringify({ occurredAt: '2027-01-01T00:00:00.000Z', eventId: eventId('040') }),
      'utf8',
    ).toString('base64url');
    expect(service.list(actor, { limit: 50, cursor: foreignCursor }).items).toEqual([]);
  });

  it('rejects invalid query parameters and cursors', () => {
    const cases: Record<string, unknown>[] = [
      { limit: '0' },
      { limit: '101' },
      { limit: 'many' },
      { projectId: 'not-a-uuid' },
      { entityId: 'not-a-uuid' },
      { eventType: 'milestone.deleted' },
      { from: 'yesterday' },
      { from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' },
      { unexpected: 'value' },
    ];

    for (const query of cases) {
      const next: NextFunction = jest.fn();
      const { res } = createResponse();
      controller.list(createRequest({ userId, tenantId, role: 'admin' }, query), res, next);
      expect(next).toHaveBeenCalledWith(expect.anything());
    }

    const invalidCursorNext = jest.fn();
    const { res } = createResponse();
    controller.list(
      createRequest({ userId, tenantId, role: 'admin' }, { cursor: 'not-a-cursor' }),
      res,
      invalidCursorNext,
    );
    expect(invalidCursorNext).toHaveBeenCalledWith(expect.anything());

    const badIdNext = jest.fn();
    controller.getById(
      createRequest({ userId, tenantId, role: 'admin' }, {}, { eventId: 'not-a-uuid' }),
      res,
      badIdNext,
    );
    expect(badIdNext).toHaveBeenCalledWith(expect.anything());
  });
});
