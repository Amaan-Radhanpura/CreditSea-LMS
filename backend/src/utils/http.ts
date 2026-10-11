import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiSuccess } from '@lms/shared';

/** Forwards rejected promises to the error handler (Express 4 doesn't do this on its own). */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function sendOk<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = { success: true, data };
  res.status(status).json(body);
}

/** Escapes user input before using it inside a RegExp (prevents ReDoS / regex injection). */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
