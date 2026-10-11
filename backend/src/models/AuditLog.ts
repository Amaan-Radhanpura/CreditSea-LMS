import { Schema, model, type Types } from 'mongoose';
import { AUDIT_ACTIONS, ROLES, type AuditAction, type Role } from '@lms/shared';

/**
 * Append-only compliance ledger: who did what, when, to which loan/borrower.
 * Kept separate from Loan.statusHistory because it also records events that aren't status
 * changes (document views, assignments, payments, profile checks), and it must be queryable
 * per user ("everything Sneha did") as well as per loan.
 */
export interface IAuditLog {
  _id: Types.ObjectId;
  /** null = system action (auto-assignment, auto-close). */
  actor: Types.ObjectId | null;
  actorRole: Role | 'SYSTEM';
  action: AuditAction;
  loan: Types.ObjectId | null;
  /** The borrower the action concerns (lets a borrower's history include what others did to their loans). */
  subjectUser: Types.ObjectId | null;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: [...ROLES, 'SYSTEM'], required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    loan: { type: Schema.Types.ObjectId, ref: 'Loan', default: null },
    subjectUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

// "History" tab for a user: what they did, and what happened to them.
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ subjectUser: 1, createdAt: -1 });
// Audit trail for one loan.
auditLogSchema.index({ loan: 1, createdAt: -1 });

// Append-only: block edits and deletes through the model. (The seed resets demo data via the raw driver.)
const immutable = () => {
  throw new Error('Audit log entries are append-only');
};
auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'], immutable);

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
