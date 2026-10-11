import { Router } from 'express';
import { applyLoanSchema } from '@lms/shared';
import { authenticate, borrowerOnly } from '../../middleware/auth';
import { validateBody, validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import * as loanService from './loan.service';

/** Borrower-facing loan endpoints. Ops modules have their own routers. */
export const loanRouter = Router();

loanRouter.use(authenticate, borrowerOnly);

loanRouter.post(
  '/',
  validateBody(applyLoanSchema),
  asyncHandler(async (req, res) => {
    sendOk(res, await loanService.applyForLoan(req.user!.id, req.body, req.ip), 201);
  }),
);

loanRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    sendOk(res, await loanService.listMyLoans(req.user!.id));
  }),
);

loanRouter.get(
  '/me/:id',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    // Scoped to the caller, so one borrower can never read another's loan (404, not 403, to avoid leaking ids).
    sendOk(res, await loanService.findLoanDTO(req.params.id!, 'BORROWER', { borrower: req.user!.id }));
  }),
);
