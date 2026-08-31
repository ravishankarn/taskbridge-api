import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuthenticationError } from '../shared/errors';
import { sendSuccess } from '../shared/http-response';
import {
  CreateMilestoneInputSchema,
  MilestoneIdParamSchema,
  UpdateMilestoneInputSchema,
} from './milestone.model';
import type { MilestoneService } from './milestone.service';
import { ProjectRouteParamSchema } from './project.model';
import type { ProjectActorContext } from './project.service';

function requireActor(req: AuthenticatedRequest): ProjectActorContext {
  if (!req.auth) {
    throw new AuthenticationError();
  }
  return { userId: req.auth.userId, tenantId: req.auth.tenantId };
}

/** HTTP boundary for the milestones resource, nested under a project. */
export class MilestoneController {
  constructor(private readonly service: MilestoneService) {}

  create = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { projectId } = ProjectRouteParamSchema.parse(req.params);
      const input = CreateMilestoneInputSchema.parse(req.body);
      const milestone = this.service.create(actor, projectId, input);
      sendSuccess(res, milestone, 201);
    } catch (error) {
      next(error);
    }
  };

  listByProject = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { projectId } = ProjectRouteParamSchema.parse(req.params);
      const milestones = this.service.listByProject(actor, projectId);
      sendSuccess(res, milestones);
    } catch (error) {
      next(error);
    }
  };

  getById = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { projectId, milestoneId } = MilestoneIdParamSchema.parse(req.params);
      const milestone = this.service.getById(actor, projectId, milestoneId);
      sendSuccess(res, milestone);
    } catch (error) {
      next(error);
    }
  };

  update = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { projectId, milestoneId } = MilestoneIdParamSchema.parse(req.params);
      const input = UpdateMilestoneInputSchema.parse(req.body);
      const milestone = this.service.update(actor, projectId, milestoneId, input);
      sendSuccess(res, milestone);
    } catch (error) {
      next(error);
    }
  };

  close = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { projectId, milestoneId } = MilestoneIdParamSchema.parse(req.params);
      const milestone = this.service.close(actor, projectId, milestoneId);
      sendSuccess(res, milestone);
    } catch (error) {
      next(error);
    }
  };
}
