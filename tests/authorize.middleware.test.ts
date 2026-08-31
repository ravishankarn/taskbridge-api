import type { Response } from 'express';
import type { AuthenticatedRequest } from '../src/middleware/auth.middleware';
import { requirePermission } from '../src/middleware/authorize.middleware';
import { AuthenticationError, AuthorizationError } from '../src/shared/errors';
import { PROJECT_PERMISSIONS } from '../src/shared/permissions';

function createRequest(auth?: AuthenticatedRequest['auth']): AuthenticatedRequest {
  return { auth } as AuthenticatedRequest;
}

describe('requirePermission', () => {
  const res = {} as Response;

  it('rejects unauthenticated requests', () => {
    const next = jest.fn();
    requirePermission(PROJECT_PERMISSIONS.READ)(createRequest(undefined), res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('rejects a member trying to delete a project', () => {
    const next = jest.fn();
    const req = createRequest({ userId: 'u1', tenantId: 't1', role: 'member' });
    requirePermission(PROJECT_PERMISSIONS.DELETE)(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });

  it('allows a manager to create projects', () => {
    const next = jest.fn();
    const req = createRequest({ userId: 'u1', tenantId: 't1', role: 'manager' });
    requirePermission(PROJECT_PERMISSIONS.CREATE)(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('allows an admin to delete projects', () => {
    const next = jest.fn();
    const req = createRequest({ userId: 'u1', tenantId: 't1', role: 'admin' });
    requirePermission(PROJECT_PERMISSIONS.DELETE)(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
