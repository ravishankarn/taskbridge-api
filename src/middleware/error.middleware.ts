import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { AppError } from '../shared/errors';
import { sendError } from '../shared/http-response';

/** Global Express error middleware: maps known errors to structured responses and logs redacted context. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = req.headers['x-correlation-id'];
  const operation = `${req.method} ${req.path}`;

  if (err instanceof AppError) {
    logger.warn('Request failed', {
      correlationId,
      operation,
      code: err.code,
      outcome: 'failure',
    });
    sendError(res, err.statusCode, err.code, err.message);
    return;
  }

  if (err instanceof ZodError) {
    logger.warn('Request validation failed', {
      correlationId,
      operation,
      outcome: 'failure',
    });
    sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed');
    return;
  }

  const error = err instanceof Error ? err : new Error('Unknown error');
  logger.error('Unhandled error', {
    correlationId,
    operation,
    outcome: 'failure',
    error: error.message,
    stack: error.stack,
  });
  sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}
