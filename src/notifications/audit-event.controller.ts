import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuthenticationError } from '../shared/errors';
import { sendSuccess } from '../shared/http-response';
import { AuditEventIdParamSchema, AuditEventQuerySchema } from './audit-event.model';
import type { AuditActorContext, AuditEventService } from './audit-event.service';

function requireActor(req: AuthenticatedRequest): AuditActorContext {
  if (!req.auth) {
    throw new AuthenticationError();
  }
  return { userId: req.auth.userId, tenantId: req.auth.tenantId, role: req.auth.role };
}

/** HTTP boundary for tenant-scoped audit history reads. */
export class AuditEventController {
  constructor(private readonly service: AuditEventService) {}

  list = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const query = AuditEventQuerySchema.parse(req.query);
      sendSuccess(res, this.service.list(actor, query));
    } catch (error) {
      next(error);
    }
  };

  getById = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { eventId } = AuditEventIdParamSchema.parse(req.params);
      sendSuccess(res, this.service.getById(actor, eventId));
    } catch (error) {
      next(error);
    }
  };
}
