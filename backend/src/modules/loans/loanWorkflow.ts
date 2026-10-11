import mongoose, { type ClientSession, type Types } from 'mongoose';
import { STAGE_OWNER, formatINR, toBusinessDate, toRupees, type AuditAction, type ExecutiveRole, type NotificationType, type Role } from '@lms/shared';
import { Loan, User } from '../../models';
import { ApiError } from '../../utils/ApiError';
import { recordAudit, type AuditActor } from '../audit/audit.service';
import { notify } from '../notifications/notification.service';
import { TRANSITIONS, transitionLoan, type Actor, type LoanAction } from './loanStateMachine';
import { nextDue, withDueDates } from './schedule';

/** Runs `fn` in a MongoDB transaction: either every write (status, assignment, audit entry) lands, or none do. */
export async function runInTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

interface Assignee {
  _id: Types.ObjectId;
  name: string;
}

/**
 * Least-loaded assignment: the active executive of `role` with the fewest open loans assigned
 * (ties go to the longest-serving account). Counts come from the { assignee, status } index.
 */
export async function pickAssignee(role: ExecutiveRole, session?: ClientSession): Promise<Assignee | null> {
  const staff = await User.find({ role, isActive: true }).sort({ createdAt: 1 }).select('name').session(session ?? null).lean();
  if (staff.length === 0) return null;

  const counts = await Loan.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { assignee: { $in: staff.map((s) => s._id) }, isOpen: true } },
    { $group: { _id: '$assignee', n: { $sum: 1 } } },
  ]).session(session ?? null);
  const load = new Map(counts.map((c) => [c._id.toString(), c.n]));

  return staff.reduce((best, s) => ((load.get(s._id.toString()) ?? 0) < (load.get(best._id.toString()) ?? 0) ? s : best), staff[0]!);
}

/** Due dates are stored as UTC midnight of the IST business date, so format them in UTC: "9 Nov 2026". */
const READABLE_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const STAGE_TASK: Record<ExecutiveRole, string> = {
  SALES: 'follow up',
  SANCTION: 'review and approve or reject',
  DISBURSEMENT: 'release the funds',
  COLLECTION: 'collect repayments',
};

/** Records the system's auto-assignment of a loan to the executive who owns its next stage, and tells them. */
export async function auditAssignment(loanId: Types.ObjectId | string, borrowerId: Types.ObjectId, stage: ExecutiveRole, assignee: Assignee, session: ClientSession) {
  const loan = await Loan.findById(loanId).select('applicant.fullName principal').session(session).lean();
  await notify(
    [
      {
        user: assignee._id,
        type: 'LOAN_ASSIGNED',
        title: 'New loan assigned to you',
        message: `${loan?.applicant.fullName ?? 'A borrower'} · ${formatINR(toRupees(loan?.principal ?? 0))}. Please ${STAGE_TASK[stage]}.`,
        loan: loanId,
      },
    ],
    session,
  );
  await recordAudit(
    {
      actor: 'SYSTEM',
      action: 'LOAN_ASSIGNED',
      loanId,
      subjectUserId: borrowerId,
      details: { stage, assigneeId: assignee._id.toString(), assigneeName: assignee.name, reason: 'Auto-assigned (least open loans)' },
    },
    session,
  );
}

/** What the borrower is told after each lifecycle step. */
const BORROWER_MESSAGE: Record<LoanAction, (amount: string, extra: { reason?: string; dueDate?: string }) => { type: NotificationType; title: string; message: string }> = {
  SANCTION: (amount) => ({ type: 'LOAN_SANCTIONED', title: 'Your loan is approved 🎉', message: `Your loan of ${amount} is approved. The money will be sent to your bank soon.` }),
  REJECT: (amount, { reason }) => ({ type: 'LOAN_REJECTED', title: 'Loan not approved', message: `We could not approve your loan of ${amount}. Reason: ${reason}` }),
  DISBURSE: (amount, { dueDate }) => ({ type: 'LOAN_DISBURSED', title: 'Money sent to your account', message: `${amount} has been sent. Your first payment is due on ${dueDate}.` }),
  CLOSE: () => ({ type: 'LOAN_CLOSED', title: 'Loan fully repaid ✅', message: 'Thank you! Your loan is closed and nothing more is due.' }),
};

const AUDIT_ACTION_FOR: Record<LoanAction, AuditAction> = {
  SANCTION: 'LOAN_SANCTIONED',
  REJECT: 'LOAN_REJECTED',
  DISBURSE: 'LOAN_DISBURSED',
  CLOSE: 'LOAN_CLOSED',
};

interface PerformOptions {
  note?: string;
  rejectionReason?: string;
  ipAddress?: string;
}

/**
 * One lifecycle step, atomically: status change + hand-over to the next stage's executive +
 * audit entries. Must be called inside a transaction (`session`).
 */
export async function performTransition(loanId: string, action: LoanAction, actor: Actor, session: ClientSession, opts: PerformOptions = {}) {
  const before = await Loan.findById(loanId)
    .select('assignee borrower tenureDays principal repaymentPlan instalments')
    .populate<{ assignee: Assignee | null }>('assignee', 'name')
    .session(session)
    .lean();
  if (!before) throw ApiError.notFound('Loan not found');

  const nextStage = STAGE_OWNER[TRANSITIONS[action].to];
  const nextAssignee = nextStage ? await pickAssignee(nextStage, session) : null;

  // Due dates are fixed the moment the money goes out: every 30 days for EMI, end of tenure for one-time.
  const schedule = action === 'DISBURSE' ? withDueDates(before.instalments, before.repaymentPlan, before.tenureDays, new Date()) : undefined;
  const firstDue = schedule ? nextDue(schedule, 0) : undefined;
  const dueDate = schedule ? toBusinessDate(schedule[schedule.length - 1]!.dueDate!) : undefined;

  const loan = await transitionLoan(loanId, action, actor, {
    session,
    note: opts.note,
    set: {
      assignee: nextAssignee?._id ?? null,
      ...(opts.rejectionReason && { rejectionReason: opts.rejectionReason }),
      ...(schedule && { instalments: schedule, dueDate: new Date(dueDate!), ...firstDue }),
    },
  });

  const auditActor: AuditActor = actor.role === 'SYSTEM' ? 'SYSTEM' : { id: actor.id, role: actor.role };
  await recordAudit(
    {
      actor: auditActor,
      action: AUDIT_ACTION_FOR[action],
      loanId,
      subjectUserId: before.borrower,
      ipAddress: opts.ipAddress,
      details: {
        from: TRANSITIONS[action].from,
        to: TRANSITIONS[action].to,
        ...(opts.note && { note: opts.note }),
        // Accountability: who was assigned vs who actually acted.
        ...(before.assignee && { assignedTo: before.assignee.name, actedByAssignee: before.assignee._id.toString() === actor.id }),
      },
    },
    session,
  );

  const msg = BORROWER_MESSAGE[action](formatINR(toRupees(before.principal)), {
    reason: opts.rejectionReason,
    dueDate: firstDue?.nextDueDate ? READABLE_DATE.format(firstDue.nextDueDate) : undefined,
  });
  await notify([{ user: before.borrower, loan: loanId, ...msg }], session);

  if (nextStage && nextAssignee) await auditAssignment(loanId, before.borrower, nextStage, nextAssignee, session);
  return loan;
}

/** Route-level helper: one transition in its own transaction. */
export const runTransition = (loanId: string, action: LoanAction, actor: { id: string; role: Role }, opts: PerformOptions = {}) =>
  runInTransaction((session) => performTransition(loanId, action, actor, session, opts));

/** Admin re-assignment of the current stage to another executive of the right role. */
export async function reassignLoan(loanId: string, assigneeId: string, admin: { id: string; role: Role }, ipAddress?: string) {
  return runInTransaction(async (session) => {
    const loan = await Loan.findById(loanId).select('status assignee borrower').populate<{ assignee: Assignee | null }>('assignee', 'name').session(session).lean();
    if (!loan) throw ApiError.notFound('Loan not found');
    const stage = STAGE_OWNER[loan.status];
    if (!stage) throw ApiError.conflict(`A ${loan.status.toLowerCase()} loan has no pending work to assign`, 'NOT_ASSIGNABLE');

    const assignee = await User.findOne({ _id: assigneeId, role: stage, isActive: true }).select('name').session(session).lean();
    if (!assignee) throw ApiError.badRequest(`Choose an active ${stage.toLowerCase()} executive`, undefined, 'INVALID_ASSIGNEE');

    await Loan.updateOne({ _id: loanId, status: loan.status }, { $set: { assignee: assignee._id } }, { session });
    await recordAudit(
      {
        actor: admin,
        action: 'LOAN_ASSIGNED',
        loanId,
        subjectUserId: loan.borrower,
        ipAddress,
        details: { stage, assigneeId: assignee._id.toString(), assigneeName: assignee.name, previousAssignee: loan.assignee?.name ?? null, reason: 'Re-assigned by admin' },
      },
      session,
    );
    await notify([{ user: assignee._id, type: 'LOAN_ASSIGNED', title: 'Loan re-assigned to you', message: `An admin assigned you a loan to ${STAGE_TASK[stage]}.`, loan: loanId }], session);
  });
}
