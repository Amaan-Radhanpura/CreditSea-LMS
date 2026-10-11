import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

/** Replaces req.body with the parsed (trimmed, normalized) value. ZodErrors become 400s in the error handler. */
export const validateBody =
  (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };

/** Rejects malformed ids before they reach Mongoose (which would throw a CastError). */
export const validateObjectId =
  (...params: string[]): RequestHandler =>
  (req, _res, next) => {
    for (const p of params) {
      if (!isValidObjectId(req.params[p])) return next(ApiError.badRequest(`Invalid ${p}`, undefined, 'INVALID_ID'));
    }
    next();
  };
