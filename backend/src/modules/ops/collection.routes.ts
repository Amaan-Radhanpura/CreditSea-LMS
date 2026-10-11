import { paymentSchema } from '@lms/shared';
import { validateBody, validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import { findLoanDTO } from '../loans/loan.service';
import * as collectionService from './collection.service';
import { createQueueRouter } from './queueRouter';

// Default queue = DISBURSED (active); CLOSED is visible as a history tab.
export const collectionRouter = createQueueRouter('COLLECTION', ['DISBURSED', 'CLOSED']);

collectionRouter.get(
  '/loans/:id/payments',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    await findLoanDTO(req.params.id!, req.user!.role, { status: { $in: ['DISBURSED', 'CLOSED'] } }); // 404 if out of scope
    sendOk(res, await collectionService.listPayments(req.params.id!));
  }),
);

collectionRouter.post(
  '/loans/:id/payments',
  validateObjectId('id'),
  validateBody(paymentSchema),
  asyncHandler(async (req, res) => {
    sendOk(res, await collectionService.recordPayment(req.params.id!, req.body, req.user!, req.ip), 201);
  }),
);
