import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuthenticationError } from '../shared/errors';
import { sendSuccess } from '../shared/http-response';
import {
  CreateProjectInputSchema,
  ProjectIdParamSchema,
  TeamIdParamSchema,
  UpdateProjectStatusInputSchema,
} from './project.model';
import type { ProjectActorContext } from './project.service';
import type { ProjectService } from './project.service';

function requireActor(req: AuthenticatedRequest): ProjectActorContext {
  if (!req.auth) {
    throw new AuthenticationError();
  }
  return { userId: req.auth.userId, tenantId: req.auth.tenantId };
}

/** HTTP boundary for the projects resource: parses/validates requests and maps results to responses. */
export class ProjectController {
  constructor(private readonly service: ProjectService) {}

  create = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const input = CreateProjectInputSchema.parse(req.body);
      const project = this.service.create(actor, input);
      sendSuccess(res, project, 201);
    } catch (error) {
      next(error);
    }
  };

  getByTeam = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { teamId } = TeamIdParamSchema.parse(req.params);
      const projects = this.service.getByTeam(actor, teamId);
      sendSuccess(res, projects);
    } catch (error) {
      next(error);
    }
  };

  getById = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { id } = ProjectIdParamSchema.parse(req.params);
      const project = this.service.getById(actor, id);
      sendSuccess(res, project);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { id } = ProjectIdParamSchema.parse(req.params);
      const { status } = UpdateProjectStatusInputSchema.parse(req.body);
      const project = this.service.updateStatus(actor, id, status);
      sendSuccess(res, project);
    } catch (error) {
      next(error);
    }
  };

  delete = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { id } = ProjectIdParamSchema.parse(req.params);
      this.service.delete(actor, id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
