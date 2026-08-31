import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuthenticationError } from '../shared/errors';
import { sendSuccess } from '../shared/http-response';
import { AddProjectMemberInputSchema, ProjectMemberRouteParamSchema } from './project-member.model';
import type { ProjectMemberService } from './project-member.service';
import { ProjectRouteParamSchema } from './project.model';
import type { ProjectActorContext } from './project.service';

function requireActor(req: AuthenticatedRequest): ProjectActorContext {
  if (!req.auth) {
    throw new AuthenticationError();
  }
  return { userId: req.auth.userId, tenantId: req.auth.tenantId };
}

/** HTTP boundary for the project-membership resource, nested under a project. */
export class ProjectMemberController {
  constructor(private readonly service: ProjectMemberService) {}

  addMember = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { projectId } = ProjectRouteParamSchema.parse(req.params);
      const input = AddProjectMemberInputSchema.parse(req.body);
      const member = this.service.addMember(actor, projectId, input);
      sendSuccess(res, member, 201);
    } catch (error) {
      next(error);
    }
  };

  listMembers = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { projectId } = ProjectRouteParamSchema.parse(req.params);
      const members = this.service.listMembers(actor, projectId);
      sendSuccess(res, members);
    } catch (error) {
      next(error);
    }
  };

  removeMember = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const actor = requireActor(req);
      const { projectId, userId } = ProjectMemberRouteParamSchema.parse(req.params);
      this.service.removeMember(actor, projectId, userId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
