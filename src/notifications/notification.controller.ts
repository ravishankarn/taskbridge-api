import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuthenticationError } from '../shared/errors';
import { sendSuccess } from '../shared/http-response';
import { NotificationIdParamSchema, NotificationQuerySchema } from './notification.model';
import type { NotificationActorContext, NotificationService } from './notification.service';

function requireActor(req: AuthenticatedRequest): NotificationActorContext {
  if (!req.auth) {
    throw new AuthenticationError();
  }
  return { userId: req.auth.userId, tenantId: req.auth.tenantId };
}

/** HTTP boundary for a user's own in-app notifications. */
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  list = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const query = NotificationQuerySchema.parse(req.query);
      sendSuccess(res, this.service.list(actor, query));
    } catch (error) {
      next(error);
    }
  };

  markRead = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { id } = NotificationIdParamSchema.parse(req.params);
      sendSuccess(res, this.service.markRead(actor, id));
    } catch (error) {
      next(error);
    }
  };
}
