import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AuthenticationError } from '../shared/errors';
import { TenantRoleSchemaValues, type TenantRole } from '../shared/permissions';

const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.enum(TenantRoleSchemaValues),
  iat: z.number(),
  exp: z.number(),
});

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

/** Verifies the bearer JWT and attaches the tenant-scoped auth context to the request. */
export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AuthenticationError('Missing bearer token'));
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const payload = JwtPayloadSchema.parse(decoded);
    req.auth = { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      operation: 'auth.authenticate',
      outcome: 'failure',
      reason: error instanceof Error ? error.name : 'unknown',
    });
    next(new AuthenticationError('Invalid or expired token'));
  }
}
