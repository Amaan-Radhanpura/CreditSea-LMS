import { Router } from 'express';
import { LOAN_STATUSES, activityQuerySchema, assignLoanSchema, toBusinessDate, toRupees, userListQuerySchema, type LoanStatus, type StatsDTO } from '@lms/shared';
import { authenticate, authorize } from '../../middleware/auth';
import { Loan } from '../../models';
import { validateBody, validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import { listAudit, userHistoryFilter } from '../audit/audit.service';
import { findLoanDTO } from '../loans/loan.service';
import { reassignLoan } from '../loans/loanWorkflow';
import { runReminderJob } from '../notifications/reminderJob';
import { getUserDetails, getUserSummary, listUsers } from './users.service';
import { countLeads } from './sales.service';

export const adminRouter = Router();
adminRouter.use(authenticate, authorize('ADMIN'));

/** Portfolio overview from a single $facet aggregation instead of one query per number. */
adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [[facets], leads, overdueLoans] = await Promise.all([
      Loan.aggregate<{
        byStatus: { _id: LoanStatus; n: number }[];
        money: { disbursed: number; collected: number; outstanding: number }[];
      }>([
        {
          $facet: {
            byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
            money: [
              { $match: { status: { $in: ['DISBURSED', 'CLOSED'] } } },
              {
                $group: {
                  _id: null,
                  disbursed: { $sum: '$principal' },
                  collected: { $sum: '$amountPaid' },
                  outstanding: { $sum: { $subtract: ['$totalRepayment', '$amountPaid'] } },
                },
              },
            ],
          },
        },
      ]),
      countLeads(),
      Loan.countDocuments({ status: 'DISBURSED', nextDueDate: { $lt: new Date(toBusinessDate()) } }),
    ]);

    const loansByStatus = Object.fromEntries(LOAN_STATUSES.map((s) => [s, 0])) as Record<LoanStatus, number>;
    for (const { _id, n } of facets?.byStatus ?? []) loansByStatus[_id] = n;
    const money = facets?.money[0];

    const stats: StatsDTO = {
      loansByStatus,
      totalDisbursed: toRupees(money?.disbursed ?? 0),
      totalCollected: toRupees(money?.collected ?? 0),
      totalOutstanding: toRupees(money?.outstanding ?? 0),
      leads,
      overdueLoans,
    };
    sendOk(res, stats);
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
