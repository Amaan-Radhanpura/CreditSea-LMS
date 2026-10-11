import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { AUTH_COOKIE, type Role } from '@lms/shared';
import { env } from '../config/env';
import { User } from '../models';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/http';

export interface JwtPayload {
  sub: string;
  role: Role;
  /** Issued-at, seconds since epoch (set by jsonwebtoken). */
  iat: number;
}

export const signToken = (userId: string, role: Role): string =>
  jwt.sign({ role } satisfies Omit<JwtPayload, 'sub' | 'iat'>, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

function extractToken(cookie: unknown, header: string | undefined): string | null {
  if (typeof cookie === 'string' && cookie) return cookie;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * 401 if there is no valid session. Loads the user from the DB on every request (a single
 * indexed _id lookup), so a deactivated account or changed role takes effect immediately
 * instead of living on until the token expires.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req.cookies?.[AUTH_COOKIE], req.headers.authorization);
  if (!token) throw ApiError.unauthorized();

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please log in again');
  }

  const user = await User.findById(payload.sub).select('name email role isActive passwordChangedAt').lean();
  if (!user || !user.isActive) throw ApiError.unauthorized('Your session has expired. Please log in again');
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
    throw ApiError.unauthorized('Your password was changed. Please log in again');
  }

  req.user = { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
  next();
});

/**
 * 403 unless the authenticated user's role is in `allowed`. ADMIN is always allowed.
 * Must run after `authenticate` (401 = who are you? / 403 = we know you, and you can't).
 */
export const authorize =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === 'ADMIN' || allowed.includes(req.user.role)) return next();
    next(ApiError.forbidden());
  };

/**
 * The borrower portal acts on "my" profile and "my" loans, so it is BORROWER-only, with no ADMIN bypass.
 * An admin has no borrower profile, so letting them in would only create bogus data.
 */
export const borrowerOnly: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== 'BORROWER') return next(ApiError.forbidden('Only borrowers can use the loan application portal'));
  next();
};
