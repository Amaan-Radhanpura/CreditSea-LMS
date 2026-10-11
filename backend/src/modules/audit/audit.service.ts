import type { ClientSession, FilterQuery, Types } from 'mongoose';
import { toRupees, type AuditAction, type AuditEntryDTO, type Paginated, type Role } from '@lms/shared';
import { AuditLog, type IAuditLog } from '../../models';

export type AuditActor = { id: string; role: Role } | 'SYSTEM';

export interface AuditInput {
  actor: AuditActor;
  action: AuditAction;
  loanId?: string | Types.ObjectId | null;
  subjectUserId?: string | Types.ObjectId | null;
  /** Small snapshot of what happened. Names are copied in so the entry stays readable even if a user is renamed later. */
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/** Appends one entry. Pass the session to make the entry part of the same transaction as the change it records. */
export async function recordAudit(input: AuditInput, session?: ClientSession): Promise<void> {
  const system = input.actor === 'SYSTEM';
  await AuditLog.create(
    [
      {
        actor: system ? null : (input.actor as { id: string }).id,
        actorRole: system ? 'SYSTEM' : (input.actor as { role: Role }).role,
        action: input.action,
        loan: input.loanId ?? null,
        subjectUser: input.subjectUserId ?? null,
        details: input.details ?? {},
        ipAddress: input.ipAddress,
      },
    ],
    { session },
  );
}

const AUDIT_POPULATE = [
  { path: 'actor', select: 'name role' },
  { path: 'loan', select: 'applicant.fullName principal' },
  { path: 'subjectUser', select: 'name' },
];

type PopulatedAudit = Omit<IAuditLog, 'actor' | 'loan' | 'subjectUser'> & {
  actor: { _id: Types.ObjectId; name: string; role: Role } | null;
  loan: { _id: Types.ObjectId; applicant: { fullName: string }; principal: number } | null;
  subjectUser: { _id: Types.ObjectId; name: string } | null;
};

const toAuditDTO = (a: PopulatedAudit): AuditEntryDTO => ({
  id: a._id.toString(),
  action: a.action,
  at: a.createdAt.toISOString(),
  actor: a.actor ? { id: a.actor._id.toString(), name: a.actor.name, role: a.actor.role } : null,
  loan: a.loan ? { id: a.loan._id.toString(), applicantName: a.loan.applicant.fullName, principal: toRupees(a.loan.principal) } : null,
  subject: a.subjectUser ? { id: a.subjectUser._id.toString(), name: a.subjectUser.name } : null,
  details: a.details ?? {},
});

export async function listAudit(filter: FilterQuery<IAuditLog>, page: number, limit: number): Promise<Paginated<AuditEntryDTO>> {
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(AUDIT_POPULATE)
      .lean<PopulatedAudit[]>(),
    AuditLog.countDocuments(filter),
  ]);
  return { items: items.map(toAuditDTO), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Everything a user did, plus everything done to them (for borrowers: who reviewed/approved/disbursed their loans). */
export const userHistoryFilter = (userId: string): FilterQuery<IAuditLog> => ({ $or: [{ actor: userId }, { subjectUser: userId }] });
