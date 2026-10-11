import { validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import { findLoanDTO } from '../loans/loan.service';
import { runTransition } from '../loans/loanWorkflow';
import { createQueueRouter } from './queueRouter';

// Default queue = SANCTIONED; DISBURSED is visible as a history tab.
export const disbursementRouter = createQueueRouter('DISBURSEMENT', ['SANCTIONED', 'DISBURSED']);

disbursementRouter.patch(
  '/loans/:id/disburse',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const loan = await runTransition(req.params.id!, 'DISBURSE', req.user!, { note: 'Funds released to borrower', ipAddress: req.ip });
    sendOk(res, await findLoanDTO(loan._id.toString(), req.user!.role));
  }),
);
