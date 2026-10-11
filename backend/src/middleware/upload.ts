import path from 'path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { UPLOAD_RULES } from '@lms/shared';
import { ApiError } from '../utils/ApiError';

const unsupported = () => new ApiError(415, 'UNSUPPORTED_FILE', 'Only PDF, JPG or PNG files are allowed');

// Files are held in memory (max 5 MB each) and then stored in MongoDB GridFS by the service,
// so nothing is ever written to the server's disk.
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_RULES.MAX_BYTES, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okMime = (UPLOAD_RULES.MIME_TYPES as readonly string[]).includes(file.mimetype);
    const okExt = (UPLOAD_RULES.EXTENSIONS as readonly string[]).includes(ext);
    if (okMime && okExt) cb(null, true);
    else cb(unsupported());
  },
});

/** First bytes of each allowed format. The client-sent MIME type alone can be spoofed. */
const SIGNATURES: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

const hasValidSignature = (file: Express.Multer.File): boolean => {
  const expected = SIGNATURES[file.mimetype];
  return !!expected && expected.every((byte, i) => file.buffer[i] === byte);
};

/** Wraps a multer handler with friendly errors, a required-fields check and signature checks. */
const withChecks =
  (handler: RequestHandler, required: string[]): RequestHandler =>
  (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, 'FILE_TOO_LARGE', 'File is too big. Maximum size is 5 MB'));
        return next(ApiError.badRequest('Please upload the files in the right fields', undefined, 'UPLOAD_ERROR'));
      }
      if (err) return next(err);

      const files = req.file ? { file: [req.file] } : ((req.files as Record<string, Express.Multer.File[]> | undefined) ?? {});
      const missing = required.filter((f) => !files[f]?.length);
      if (missing.length) {
        return next(
          ApiError.badRequest('Please choose all the required documents', Object.fromEntries(missing.map((m) => [m, ['This document is required']])), 'VALIDATION_ERROR'),
        );
      }
      if (Object.values(files).flat().some((f) => !hasValidSignature(f))) return next(unsupported());
      next();
    });
  };

/** One `file` field: PDF/JPG/PNG, at most 5 MB, with matching file signature. Used to replace a document. */
export const uploadDocument = withChecks(uploader.single('file'), ['file']);

/** Sign-up: both documents at once, `salarySlip` and `panCard`. */
export const uploadSignupDocuments = withChecks(
  uploader.fields([
    { name: 'salarySlip', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
  ]),
  ['salarySlip', 'panCard'],
);
