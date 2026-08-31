import type { NextFunction, Response } from 'express';
import { AuthenticationError, AuthorizationError } from '../shared/errors';
import { roleHasPermission, type Permission } from '../shared/permissions';
import type { AuthenticatedRequest } from './auth.middleware';

/** Enforces RBAC: rejects requests whose authenticated tenant role lacks the required permission. */
export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AuthenticationError());
      return;
    }

    if (!roleHasPermission(req.auth.role, permission)) {
      next(new AuthorizationError(`Role "${req.auth.role}" lacks permission "${permission}"`));
      return;
    }

    next();
  };
}
