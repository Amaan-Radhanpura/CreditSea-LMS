import { rejectLoanSchema } from '@lms/shared';
import { validateBody, validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import { findLoanDTO } from '../loans/loan.service';
import { runTransition } from '../loans/loanWorkflow';
import { createQueueRouter } from './queueRouter';

// Default queue = APPLIED; SANCTIONED / REJECTED are visible as history tabs.
export const sanctionRouter = createQueueRouter('SANCTION', ['APPLIED', 'SANCTIONED', 'REJECTED']);

sanctionRouter.patch(
  '/loans/:id/approve',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const loan = await runTransition(req.params.id!, 'SANCTION', req.user!, { note: 'Loan approved', ipAddress: req.ip });
    sendOk(res, await findLoanDTO(loan._id.toString(), req.user!.role));
  }),
);

sanctionRouter.patch(
  '/loans/:id/reject',
  validateObjectId('id'),
  validateBody(rejectLoanSchema),
  asyncHandler(async (req, res) => {
    const { reason } = req.body as { reason: string };
    const loan = await runTransition(req.params.id!, 'REJECT', req.user!, { note: reason, rejectionReason: reason, ipAddress: req.ip });
    sendOk(res, await findLoanDTO(loan._id.toString(), req.user!.role));
  }),
);
