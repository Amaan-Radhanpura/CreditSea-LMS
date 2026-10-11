import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { borrowerRouter } from './modules/borrower/borrower.routes';
import { documentRouter } from './modules/documents/document.routes';
import { loanRouter } from './modules/loans/loan.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { adminRouter } from './modules/ops/admin.routes';
import { collectionRouter } from './modules/ops/collection.routes';
import { disbursementRouter } from './modules/ops/disbursement.routes';
import { salesRouter } from './modules/ops/sales.routes';
import { sanctionRouter } from './modules/ops/sanction.routes';
import { logger } from './utils/logger';
import { sendOk } from './utils/http';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1); // behind the Next.js proxy / a hosting load balancer: req.ip is the real client
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (!env.isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  // Brute-force protection on credential endpoints.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again in a few minutes' } },
  });

  const api = Router();
  api.get('/health', (_req, res) => sendOk(res, { status: 'ok' }));
  api.use('/auth/login', authLimiter);
  api.use('/auth/register', authLimiter);
  api.use('/auth', authRouter);

  // Borrower portal
  api.use('/borrower', borrowerRouter);
  api.use('/loans', loanRouter);
  api.use('/documents', documentRouter);

  // Operations dashboard: one router per module, each guarded by its role (+ ADMIN)
  api.use('/sales', salesRouter);
  api.use('/sanction', sanctionRouter);
  api.use('/disbursement', disbursementRouter);
  api.use('/collection', collectionRouter);
  api.use('/admin', adminRouter);
  api.use('/audit', auditRouter);
  api.use('/notifications', notificationRouter);

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
