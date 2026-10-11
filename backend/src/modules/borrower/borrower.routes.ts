import { Router } from 'express';
import { DOCUMENT_KINDS, DOCUMENT_SLUG, profileSchema } from '@lms/shared';
import { authenticate, borrowerOnly } from '../../middleware/auth';
import { uploadDocument } from '../../middleware/upload';
import { validateBody } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import * as borrowerService from './borrower.service';

export const borrowerRouter = Router();

// Borrower portal only: every other role (including ADMIN) gets a 403.
borrowerRouter.use(authenticate, borrowerOnly);

borrowerRouter.get(
  '/state',
  asyncHandler(async (req, res) => {
    sendOk(res, await borrowerService.getBorrowerState(req.user!.id));
  }),
);

borrowerRouter.put(
  '/profile',
  validateBody(profileSchema),
  asyncHandler(async (req, res) => {
    sendOk(res, await borrowerService.saveProfile(req.user!.id, req.body));
  }),
);

// Replace a document: POST /borrower/documents/salary-slip | /borrower/documents/pan-card (field "file").
for (const kind of DOCUMENT_KINDS) {
  borrowerRouter.post(
    `/documents/${DOCUMENT_SLUG[kind]}`,
    uploadDocument,
    asyncHandler(async (req, res) => {
      sendOk(res, await borrowerService.saveDocument(req.user!.id, kind, req.file!), 201);
    }),
  );
}
