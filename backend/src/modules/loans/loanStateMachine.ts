import type { ClientSession, UpdateQuery } from 'mongoose';
import type { LoanStatus, Role } from '@lms/shared';
import { Loan, type ILoan, type LoanDoc } from '../../models';
import { ApiError } from '../../utils/ApiError';

export type LoanAction = 'SANCTION' | 'REJECT' | 'DISBURSE' | 'CLOSE';

interface Transition {
  from: LoanStatus;
  to: LoanStatus;
  /** Roles allowed to trigger it (ADMIN always can). Empty = system only. */
  roles: Role[];
  label: string;
}

/**
 * The single source of truth for loan lifecycle rules.
 *
 *   APPLIED ──SANCTION──► SANCTIONED ──DISBURSE──► DISBURSED ──CLOSE (auto, fully repaid)──► CLOSED
 *      └──────REJECT─────► REJECTED
 */
export const TRANSITIONS: Record<LoanAction, Transition> = {
  SANCTION: { from: 'APPLIED', to: 'SANCTIONED', roles: ['SANCTION'], label: 'approve' },
  REJECT: { from: 'APPLIED', to: 'REJECTED', roles: ['SANCTION'], label: 'reject' },
  DISBURSE: { from: 'SANCTIONED', to: 'DISBURSED', roles: ['DISBURSEMENT'], label: 'disburse' },
  CLOSE: { from: 'DISBURSED', to: 'CLOSED', roles: [], label: 'close' },
};

const OPEN_AFTER: Record<LoanStatus, boolean> = {
  APPLIED: true,
  SANCTIONED: true,
  DISBURSED: true,
  REJECTED: false,
  CLOSED: false,
};

export interface Actor {
  id: string;
  role: Role | 'SYSTEM';
}

interface TransitionOptions {
  note?: string;
  session?: ClientSession;
  /** Extra fields that must be set atomically with the status change (e.g. rejectionReason). */
  set?: Partial<Pick<ILoan, 'rejectionReason' | 'assignee' | 'dueDate' | 'instalments' | 'nextDueDate' | 'nextDueAmount'>>;
}

/**
 * Moves a loan along one edge of the state machine.
 * The update is conditional on the current status (`{ _id, status: from }`), so two executives
 * clicking at the same moment can't both succeed: the loser gets a 409.
 */
export async function transitionLoan(loanId: string, action: LoanAction, actor: Actor, opts: TransitionOptions = {}): Promise<LoanDoc> {
  const t = TRANSITIONS[action];
  const permitted = actor.role === 'SYSTEM' ? t.roles.length === 0 : actor.role === 'ADMIN' || t.roles.includes(actor.role);
  if (!permitted) throw ApiError.forbidden(`You are not allowed to ${t.label} loans`);

  const now = new Date();
  const actorId = actor.role === 'SYSTEM' ? null : actor.id;
  const stamps: Record<LoanAction, Record<string, unknown>> = {
    SANCTION: { sanctionedAt: now, sanctionedBy: actorId },
    REJECT: { rejectedAt: now, rejectedBy: actorId },
    DISBURSE: { disbursedAt: now, disbursedBy: actorId },
    CLOSE: { closedAt: now },
  };

  const update: UpdateQuery<ILoan> = {
    $set: { status: t.to, isOpen: OPEN_AFTER[t.to], ...stamps[action], ...opts.set },
    $push: { statusHistory: { from: t.from, to: t.to, by: actorId, at: now, note: opts.note } },
  };

  const updated = await Loan.findOneAndUpdate({ _id: loanId, status: t.from }, update, { new: true, session: opts.session });
  if (updated) return updated;

  const current = await Loan.findById(loanId).select('status').session(opts.session ?? null).lean();
  if (!current) throw ApiError.notFound('Loan not found');
  throw ApiError.conflict(`Cannot ${t.label} a loan that is ${current.status.toLowerCase()}`, 'INVALID_TRANSITION', {
    currentStatus: current.status,
    expectedStatus: t.from,
  });
}
