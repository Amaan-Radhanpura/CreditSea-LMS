import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { listQuerySchema, type ExecutiveRole, type LoanStatus } from '@lms/shared';
import { authenticate, authorize } from '../../middleware/auth';
import { validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import { ApiError } from '../../utils/ApiError';
import * as loanService from '../loans/loan.service';
import { assertCanSeeLoan } from '../loans/visibility';

/**
 * Builds the router shared by every loan-based ops module (Sanction, Disbursement, Collection):
 * auth + role guard, a paginated queue, and a detail endpoint. Both are limited to the module's
 * statuses, so e.g. a Sanction executive can't read a loan that is already in Collection.
 */
export function createQueueRouter(role: ExecutiveRole, scope: readonly LoanStatus[]): Router {
  const router = Router();
  router.use(authenticate, authorize(role));

  // Every route with a loan :id (detail, actions, payments) first checks the loan is in this module
  // AND belongs to the caller; otherwise 404, so other executives' loans are invisible.
  router.param('id', (req, _res, next, id: string) => {
    if (!isValidObjectId(id)) return next(ApiError.badRequest('Invalid id', undefined, 'INVALID_ID'));
    assertCanSeeLoan(id, req.user!, scope).then(() => next(), next);
  });

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

  return router;
}
