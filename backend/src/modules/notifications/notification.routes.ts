import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validateObjectId } from '../../middleware/validate';
import { asyncHandler, sendOk } from '../../utils/http';
import { listNotifications, markRead } from './notification.service';

/** Every signed-in user (borrower or staff) has their own notification inbox. */
export const notificationRouter = Router();
notificationRouter.use(authenticate);

notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    sendOk(res, await listNotifications(req.user!.id));
  }),
);

notificationRouter.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    await markRead(req.user!.id);
    sendOk(res, await listNotifications(req.user!.id));
  }),
);

notificationRouter.patch(
  '/:id/read',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    await markRead(req.user!.id, req.params.id);
    sendOk(res, await listNotifications(req.user!.id));
  }),
);
