import { Schema, model, type Types } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '@lms/shared';

/** In-app notification. Delivery channel is in-app only for now; email/SMS would read from the same records. */
export interface INotification {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  loan: Types.ObjectId | null;
  readAt: Date | null;
  /**
   * Idempotency key for scheduled reminders, e.g. "due:<loanId>:2026-10-11".
   * The unique index makes the reminder job safe to run any number of times (or on several servers):
   * a second insert with the same key is simply rejected.
   */
  dedupeKey?: string;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 500 },
    loan: { type: Schema.Types.ObjectId, ref: 'Loan', default: null },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Bell dropdown: latest first, and the unread count.
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

export const Notification = model<INotification>('Notification', notificationSchema);
