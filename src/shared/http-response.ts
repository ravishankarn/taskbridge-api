import type { Response } from 'express';

interface SuccessBody<T> {
  success: true;
  data: T;
}

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: SuccessBody<T> = { success: true, data };
  res.status(statusCode).json(body);
}

export function sendError(res: Response, statusCode: number, code: string, message: string): void {
  const body: ErrorBody = { success: false, error: { code, message } };
  res.status(statusCode).json(body);
}
