import { Router } from 'express';
import { activityQuerySchema } from '@lms/shared';
import { authenticate, authorize } from '../../middleware/auth';
import { validateObjectId } from '../../middleware/validate';
import { Loan } from '../../models';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler, sendOk } from '../../utils/http';
import { listAudit, userHistoryFilter } from './audit.service';

export const auditRouter = Router();
auditRouter.use(authenticate);

/** "My activity": any signed-in user can see their own history. */
auditRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { page, limit } = activityQuerySchema.parse(req.query);
    sendOk(res, await listAudit(userHistoryFilter(req.user!.id), page, limit));
  }),
);

/** Full audit trail of one loan, for the executives who work on loans (and ADMIN). */
auditRouter.get(
  '/loans/:id',
  authorize('SANCTION', 'DISBURSEMENT', 'COLLECTION'),
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { page, limit } = activityQuerySchema.parse(req.query);
    if (!(await Loan.exists({ _id: req.params.id }))) throw ApiError.notFound('Loan not found');
    sendOk(res, await listAudit({ loan: req.params.id }, page, limit));
  }),
);
