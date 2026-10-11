import { Router, type CookieOptions, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { AUTH_COOKIE, changePasswordSchema, loginSchema, signupSchema, updateAccountSchema, type BreResult, type UserDTO } from '@lms/shared';
import { env } from '../../config/env';
import { authenticate, signToken } from '../../middleware/auth';
import { uploadSignupDocuments } from '../../middleware/upload';
import { validateBody } from '../../middleware/validate';
import type { IUser } from '../../models';
import { asyncHandler, sendOk } from '../../utils/http';
import { toUserDTO } from '../mappers';
import { recordAudit } from '../audit/audit.service';
import { signupBorrower } from '../borrower/borrower.service';
import * as authService from './auth.service';

const cookieOptions: CookieOptions = {
  httpOnly: true, // not readable by JS, so an XSS bug can't steal the session
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
};

function startSession(res: Response, user: IUser): UserDTO {
  const token = signToken(user._id.toString(), user.role);
  const { exp } = jwt.decode(token) as { exp: number };
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions, expires: new Date(exp * 1000) });
  return toUserDTO(user);
}

export const authRouter = Router();

/**
 * Borrower sign-up (multipart): account + personal details + `salarySlip` + `panCard`, saved together.
 * Always creates a BORROWER. Responds 201 with the eligibility (BRE) result; an ineligible borrower
 * gets an account but cannot apply until their details pass.
 */
authRouter.post(
  '/register',
  uploadSignupDocuments,
  asyncHandler(async (req, res) => {
    const files = req.files as Record<'salarySlip' | 'panCard', Express.Multer.File[]>;
    const input = signupSchema.parse(req.body);
    const { user, bre } = await signupBorrower(input, { salarySlip: files.salarySlip[0]!, panCard: files.panCard[0]! }, req.ip);
    const body: { user: UserDTO; bre: BreResult } = { user: startSession(res, user), bre };
    sendOk(res, body, 201);
  }),
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.login(req.body);
    sendOk(res, { user: startSession(res, user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  sendOk(res, { loggedOut: true });
});

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    sendOk(res, { user: toUserDTO(await authService.getAccount(req.user!.id)) });
  }),
);

/** Edit own account (name only: email is the login identity, role is admin-controlled). */
authRouter.patch(
  '/me',
  authenticate,
  validateBody(updateAccountSchema),
  asyncHandler(async (req, res) => {
    const before = req.user!.name;
    const user = await authService.updateAccount(req.user!.id, req.body);
    await recordAudit({
      actor: req.user!,
      action: 'ACCOUNT_UPDATED',
      subjectUserId: req.user!.id,
      ipAddress: req.ip,
      details: { field: 'name', from: before, to: user.name },
    });
    sendOk(res, { user: toUserDTO(user) });
  }),
);

/** Change own password. Re-issues this session's cookie; every other session is logged out. */
authRouter.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.changePassword(req.user!.id, req.body);
    await recordAudit({ actor: req.user!, action: 'PASSWORD_CHANGED', subjectUserId: req.user!.id, ipAddress: req.ip, details: { otherSessionsLoggedOut: true } });
    sendOk(res, { user: startSession(res, user) });
  }),
);
