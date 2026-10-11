import { Router } from 'express';
import { activityQuerySchema, assignLoanSchema, userListQuerySchema } from '@lms/shared';
import { authenticate, authorize } from '../../middleware/auth';
import { validateBody, validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import { listAudit, userHistoryFilter } from '../audit/audit.service';
import { findLoanDTO } from '../loans/loan.service';
import { reassignLoan } from '../loans/loanWorkflow';
import { runReminderJob } from '../notifications/reminderJob';
import { getPortfolioStats } from './admin.service';
import { getUserDetails, getUserSummary, listUsers } from './users.service';

export const adminRouter = Router();
adminRouter.use(authenticate, authorize('ADMIN'));

/** Portfolio overview (counts per status, money totals, leads, overdue loans). */
adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    sendOk(res, await getPortfolioStats());
  }),
);

/** Users directory with per-user activity counts. */
adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    sendOk(res, await listUsers(userListQuerySchema.parse(req.query)));
  }),
);

adminRouter.get(
  '/users/:id',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    sendOk(res, await getUserSummary(req.params.id!));
  }),
);

/** Side panel: profile, eligibility, documents and loans in one call. */
adminRouter.get(
  '/users/:id/details',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    sendOk(res, await getUserDetails(req.params.id!));
  }),
);

/** History tab: everything the user did + everything done to them (newest first). */
adminRouter.get(
  '/users/:id/activity',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { page, limit } = activityQuerySchema.parse(req.query);
    sendOk(res, await listAudit(userHistoryFilter(req.params.id!), page, limit));
  }),
);

/** Hand the current stage of a loan to a different executive (audited). */
adminRouter.patch(
  '/loans/:id/assign',
  validateObjectId('id'),
  validateBody(assignLoanSchema),
  asyncHandler(async (req, res) => {
    await reassignLoan(req.params.id!, req.body.assigneeId, req.user!, req.ip);
    sendOk(res, await findLoanDTO(req.params.id!, req.user!.role));
  }),
);

/** Runs the due/overdue reminder check immediately (it also runs on a schedule). Safe to repeat. */
adminRouter.post(
  '/jobs/reminders',
  asyncHandler(async (_req, res) => {
    sendOk(res, await runReminderJob());
  }),
);
