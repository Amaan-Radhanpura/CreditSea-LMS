import type { ClientSession, Types } from 'mongoose';
import type { NotificationDTO, NotificationListDTO, NotificationType } from '@lms/shared';
import { Notification, type INotification } from '../../models';

export interface NewNotification {
  user: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  message: string;
  loan?: Types.ObjectId | string | null;
  dedupeKey?: string;
}

const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && ((err as { code?: number }).code === 11000 || Array.isArray((err as { writeErrors?: unknown[] }).writeErrors));

/**
 * Inserts notifications, skipping any whose dedupeKey already exists.
 * Returns how many were actually created.
 */
export async function notify(items: NewNotification[], session?: ClientSession): Promise<number> {
  if (items.length === 0) return 0;
  const docs = items.map((n) => ({ ...n, loan: n.loan ?? null }));
  try {
    const created = await Notification.insertMany(docs, { ordered: false, session });
    return created.length;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    // ordered:false keeps inserting after a duplicate; count what got through.
    const inserted = (err as { insertedDocs?: unknown[] }).insertedDocs;
    return inserted?.length ?? 0;
  }
}

const toDTO = (n: INotification): NotificationDTO => ({
  id: n._id.toString(),
  type: n.type,
  title: n.title,
  message: n.message,
  loanId: n.loan ? n.loan.toString() : null,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

export async function listNotifications(userId: string, limit = 20): Promise<NotificationListDTO> {
  const [items, unread] = await Promise.all([
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);
  return { items: items.map(toDTO), unread };
}

/** Marks one (or, without an id, all) of the user's notifications as read. Scoped to the user. */
export async function markRead(userId: string, notificationId?: string): Promise<void> {
  await Notification.updateMany(
    { user: userId, readAt: null, ...(notificationId && { _id: notificationId }) },
    { $set: { readAt: new Date() } },
  );
}
