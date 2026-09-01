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

  /** `POST /projects` — creates a project owned by the authenticated actor's tenant. */
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

  /** `GET /projects/team/:teamId` — lists a team's projects within the actor's tenant. */
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

  /** `GET /projects/:id` — fetches a single project scoped to the actor's tenant. */
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

  /** `PATCH /projects/:id/status` — transitions a project's status within the actor's tenant. */
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

  /** `DELETE /projects/:id` — deletes a project within the actor's tenant. */
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
