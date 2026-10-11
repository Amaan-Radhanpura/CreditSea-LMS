import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@lms/shared';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

/** Unique-index violations, mapped to friendly 409s. Keys are the indexed field names. */
const DUPLICATE_KEY_ERRORS: Record<string, { code: string; message: string }> = {
  email: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
  utr: { code: 'DUPLICATE_UTR', message: 'This UTR number has already been recorded' },
  pan: { code: 'PAN_TAKEN', message: 'This PAN is already registered with another account' },
  borrower: { code: 'OPEN_LOAN_EXISTS', message: 'You already have a loan in progress' },
};

interface MongoDuplicateKeyError {
  code: 11000;
  keyPattern?: Record<string, unknown>;
}

const isDuplicateKeyError = (err: unknown): err is MongoDuplicateKeyError =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  // Structural check: schemas from @lms/shared may resolve a different copy of zod, so `instanceof` isn't reliable.
  if (err instanceof ZodError || (err instanceof Error && err.name === 'ZodError' && 'flatten' in err)) {
    const fieldErrors = (err as ZodError).flatten().fieldErrors;
    return ApiError.badRequest('Please check the highlighted fields', fieldErrors, 'VALIDATION_ERROR');
  }

  if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? '';
    const mapped = DUPLICATE_KEY_ERRORS[field] ?? { code: 'DUPLICATE', message: 'This record already exists' };
    return ApiError.conflict(mapped.message, mapped.code);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, [v.message]]));
    return ApiError.badRequest('Invalid data', details, 'VALIDATION_ERROR');
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid ${err.path}`, undefined, 'INVALID_ID');
  }

  // Database unreachable: a temporary outage, not a bug in the request.
  if (err instanceof Error && (err.name === 'MongoServerSelectionError' || err.name === 'MongooseServerSelectionError')) {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', 'Our server is starting up. Please try again in a few seconds');
  }

  // Malformed JSON body from express.json()
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON', undefined, 'INVALID_JSON');
  }

  return new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const apiError = toApiError(err);
  if (apiError.status >= 500) logger.error({ err, path: req.path }, 'Unhandled error');

  const body: ApiErrorBody = {
    success: false,
    error: { code: apiError.code, message: apiError.message, ...(apiError.details ? { details: apiError.details } : {}) },
  };
  res.status(apiError.status).json(body);
};

export const notFound: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};
