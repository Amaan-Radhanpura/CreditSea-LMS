import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validateObjectId } from '../../middleware/validate';
import { asyncHandler } from '../../utils/http';
import { openDocument } from './document.service';

export const documentRouter = Router();

// Files are never served statically: every download goes through auth + an ownership/role check.
documentRouter.get(
  '/:id',
  authenticate,
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const { doc, stream } = await openDocument(req.params.id!, req.user!, req.ip);

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream
      .on('error', () => {
        if (!res.headersSent) res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
        else res.end();
      })
      .pipe(res);
  }),
);
