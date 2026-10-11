import path from 'path';
import { Router } from 'express';
import type { Role } from '@lms/shared';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { validateObjectId } from '../../middleware/validate';
import { DocumentModel, Loan } from '../../models';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/http';
import { recordAudit } from '../audit/audit.service';

/** Roles that may open any borrower's documents (to verify identity and income before approving). */
const REVIEWER_ROLES: Role[] = ['ADMIN', 'SANCTION'];

export const documentRouter = Router();

// Files are never served statically: every download goes through auth + an ownership/role check.
documentRouter.get(
  '/:id',
  authenticate,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const doc = await DocumentModel.findById(req.params.id).lean();
    if (!doc) throw ApiError.notFound('Document not found');

    const user = req.user!;
    const isOwner = doc.owner.toString() === user.id;
    if (!isOwner && !REVIEWER_ROLES.includes(user.role)) throw ApiError.forbidden();

    // "Who reviewed the documents": every non-owner view is written to the audit log.
    if (!isOwner) {
      const loan = await Loan.findOne({ $or: [{ salarySlip: doc._id }, { panCard: doc._id }] }).sort({ createdAt: -1 }).select('_id').lean();
      await recordAudit({
        actor: user,
        action: 'DOCUMENT_VIEWED',
        loanId: loan?._id ?? null,
        subjectUserId: doc.owner,
        ipAddress: req.ip,
        details: { documentId: doc._id.toString(), kind: doc.kind, fileName: doc.originalName },
      });
    }

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(path.join(env.uploadDir, path.basename(doc.storedName)), (err) => {
      if (err && !res.headersSent) res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
    });
  }),
);
