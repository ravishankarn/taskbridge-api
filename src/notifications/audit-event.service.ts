import { logger } from '../config/logger';
import { NotFoundError, ValidationError } from '../shared/errors';
import type { TenantRole } from '../shared/permissions';
import { AuditCursorSchema, type AuditEvent, type AuditEventQuery } from './audit-event.model';
import type { AuditEventRepository } from './audit-event.repository';

export interface AuditActorContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

/** Resource-level authorization port, satisfied by the Project Service `ProjectMemberService`. */
export interface ProjectAccessDirectory {
  listAuthorizedProjectIds(tenantId: string, userId: string): string[];
}

export interface AuditEventPage {
  items: AuditEvent[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

function encodeCursor(event: AuditEvent): string {
  const payload = JSON.stringify({ occurredAt: event.occurredAt, eventId: event.eventId });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string) {
  try {
    const payload: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return AuditCursorSchema.parse(payload);
  } catch {
    throw new ValidationError('Invalid pagination cursor');
  }
}

/**
 * Read-side business rules for audit history. Tenant scope always comes from the verified actor;
 * client-supplied filters and cursors can only narrow that scope, never widen or replace it.
 *
 * Admins see the whole tenant. Every other permitted role is additionally restricted to the
 * projects they are a member of, so `audit:read` alone is not sufficient to read a project.
 */
export class AuditEventService {
  constructor(
    private readonly repository: AuditEventRepository,
    private readonly projectAccess: ProjectAccessDirectory,
  ) {}

  /** Returns undefined when the actor may read every project in the tenant. */
  private authorizedProjectIds(actor: AuditActorContext): string[] | undefined {
    if (actor.role === 'admin') {
      return undefined;
    }
    return this.projectAccess.listAuthorizedProjectIds(actor.tenantId, actor.userId);
  }

  list(actor: AuditActorContext, query: AuditEventQuery): AuditEventPage {
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

    // Fetch one extra row to detect a further page without running a count query.
    const rows = this.repository.findPage(actor.tenantId, {
      projectId: query.projectId,
      entityId: query.entityId,
      eventType: query.eventType,
      from: query.from,
      to: query.to,
      cursor,
      authorizedProjectIds: this.authorizedProjectIds(actor),
      limit: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items[items.length - 1];

    logger.info('Audit history listed', {
      tenantId: actor.tenantId,
      userId: actor.userId,
      operation: 'audit.list',
      returned: items.length,
      outcome: 'success',
    });

    return {
      items,
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && last ? encodeCursor(last) : null,
      },
    };
  }

  getById(actor: AuditActorContext, eventId: string): AuditEvent {
    const event = this.repository.findById(actor.tenantId, eventId);
    const authorized = this.authorizedProjectIds(actor);

    // An event outside the actor's projects is reported as missing, not as forbidden, so audit
    // existence is not disclosed across projects.
    if (!event || (authorized && !authorized.includes(event.projectId))) {
      throw new NotFoundError(`Audit event ${eventId} was not found`);
    }
    return event;
  }
}
