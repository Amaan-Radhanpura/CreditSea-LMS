import { Router } from 'express';
import { listQuerySchema, type ExecutiveRole, type LoanStatus } from '@lms/shared';
import { authenticate, authorize } from '../../middleware/auth';
import { validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import * as loanService from '../loans/loan.service';
import { takeOverLoan } from '../loans/loanWorkflow';

/**
 * Builds the router shared by every loan-based ops module (Sanction, Disbursement, Collection):
 * auth + role guard, a paginated queue, and a detail endpoint. Both are limited to the module's
 * statuses, so e.g. a Sanction executive can't read a loan that is already in Collection.
 */
export function createQueueRouter(role: ExecutiveRole, scope: readonly LoanStatus[]): Router {
  const router = Router();
  router.use(authenticate, authorize(role));

  router.get(
    '/loans',
    asyncHandler(async (req, res) => {
      sendOk(res, await loanService.listLoans(scope, listQuerySchema.parse(req.query), req.user!));
    }),
  );

  router.get(
    '/loans/:id',
    validateObjectId('id'),
    asyncHandler(async (req, res) => {
      sendOk(res, await loanService.findLoanDTO(req.params.id!, req.user!.role, { status: { $in: scope } }));
    }),
  );

  /** Assign the loan's current stage to yourself (audited; the previous assignee is notified). */
  router.post(
    '/loans/:id/take-over',
    validateObjectId('id'),
    asyncHandler(async (req, res) => {
      await loanService.findLoanDTO(req.params.id!, req.user!.role, { status: { $in: scope } }); // 404 if out of this module's scope
      await takeOverLoan(req.params.id!, req.user!, req.ip);
      sendOk(res, await loanService.findLoanDTO(req.params.id!, req.user!.role));
    }),
  );

  return router;
}
