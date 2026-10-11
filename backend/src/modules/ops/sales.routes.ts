import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler, sendOk } from '../../utils/http';
import * as salesService from './sales.service';

const leadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
  stage: z.enum(['REGISTERED', 'PROFILE_REJECTED', 'PROFILE_COMPLETED', 'SLIP_UPLOADED']).optional(),
});

export const salesRouter = Router();
salesRouter.use(authenticate, authorize('SALES'));

salesRouter.get(
  '/leads',
  asyncHandler(async (req, res) => {
    sendOk(res, await salesService.listLeads(leadQuerySchema.parse(req.query)));
  }),
);
