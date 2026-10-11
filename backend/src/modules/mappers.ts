import { Types } from 'mongoose';
import { FULL_PAN_ROLES, allocatePayments, daysBetween, maskPan, toBusinessDate, toRupees, type ActorDTO, type InstalmentDTO, type InstalmentStatus, type DocumentDTO, type LoanDTO, type PaymentDTO, type ProfileDTO, type Role, type UserDTO } from '@lms/shared';
import type { IBorrowerProfile, IDocument, ILoan, IPayment, IStatusChange, IUser } from '../models';
import { isoDate } from '../utils/http';

/** DB documents store money in paise; DTOs speak rupees. All conversion happens here. */

type Ref<T> = T | Types.ObjectId | null | undefined;

const isPopulated = <T extends object>(ref: Ref<T>): ref is T => ref != null && !(ref instanceof Types.ObjectId);

/** Populate spec used by every loan query that is returned to a client. */
export const LOAN_POPULATE = [
  { path: 'borrower', select: 'name email' },
  { path: 'assignee', select: 'name role' },
  { path: 'salarySlip' },
  { path: 'panCard' },
  { path: 'statusHistory.by', select: 'name role' },
];

type UserRef = Pick<IUser, '_id' | 'name' | 'email'>;
type ActorRef = Pick<IUser, '_id' | 'name' | 'role'>;

export type LoanWithRefs = Omit<ILoan, 'borrower' | 'salarySlip' | 'panCard' | 'statusHistory' | 'assignee'> & {
  borrower: Ref<UserRef>;
  assignee: Ref<ActorRef>;
  salarySlip: Ref<IDocument>;
  panCard: Ref<IDocument>;
  statusHistory: Array<Omit<IStatusChange, 'by'> & { by: Ref<ActorRef> }>;
};

export const toUserDTO = (u: Pick<IUser, '_id' | 'name' | 'email' | 'role' | 'createdAt'>): UserDTO => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt.toISOString(),
});

export const toDocumentDTO = (d: Ref<IDocument>): DocumentDTO | null =>
  isPopulated(d)
    ? { id: d._id.toString(), kind: d.kind, originalName: d.originalName, mimeType: d.mimeType, size: d.size, uploadedAt: d.createdAt.toISOString() }
    : null;

export const toProfileDTO = (p: Omit<IBorrowerProfile, 'salarySlip' | 'panCard'> & { salarySlip: Ref<IDocument>; panCard: Ref<IDocument> }): ProfileDTO => ({
  fullName: p.fullName,
  pan: p.pan,
  dob: isoDate(p.dob),
  monthlySalary: toRupees(p.monthlySalary),
  employmentMode: p.employmentMode,
  bre: { passed: p.bre.passed, failures: p.bre.failures, checkedAt: p.bre.checkedAt.toISOString() },
  salarySlip: toDocumentDTO(p.salarySlip),
  panCard: toDocumentDTO(p.panCard),
});

const DAY_MS = 24 * 60 * 60 * 1000;

export const toActorDTO = (a: Ref<ActorRef>): ActorDTO | null =>
  isPopulated(a) ? { id: a._id.toString(), name: a.name, role: a.role } : null;

/** `viewer` decides whether the PAN is shown in full (data minimization: only roles that verify identity). */
export function toLoanDTO(l: LoanWithRefs, viewer: Role): LoanDTO {
  const borrower = isPopulated(l.borrower)
    ? { id: l.borrower._id.toString(), name: l.borrower.name, email: l.borrower.email }
    : { id: String(l.borrower), name: '', email: '' };
  const finalDue = l.dueDate ? isoDate(l.dueDate) : l.disbursedAt ? toBusinessDate(new Date(l.disbursedAt.getTime() + l.tenureDays * DAY_MS)) : null;
  const today = toBusinessDate();

  // Older loans without a stored schedule are a single instalment of the whole amount.
  const schedule = l.instalments?.length ? l.instalments : [{ number: 1, amount: l.totalRepayment, dueDate: finalDue ? new Date(finalDue) : null }];
  const { paid, nextIndex } = allocatePayments(
    schedule.map((i) => i.amount),
    l.amountPaid,
  );
  const instalments: InstalmentDTO[] = schedule.map((inst, i) => {
    const due = inst.dueDate ? isoDate(inst.dueDate) : null;
    const covered = paid[i]!;
    let status: InstalmentStatus;
    if (covered >= inst.amount) status = 'PAID';
    else if (due && due < today && l.status === 'DISBURSED') status = 'OVERDUE';
    else if (covered > 0) status = 'PARTLY_PAID';
    else if (i === nextIndex && due) status = 'DUE';
    else status = 'UPCOMING';
    return { number: inst.number, amount: toRupees(inst.amount), paid: toRupees(covered), dueDate: due, status };
  });

  const next = l.status === 'DISBURSED' && nextIndex >= 0 ? instalments[nextIndex] : undefined;
  const nextDue = next?.dueDate ? { number: next.number, amount: toRupees(schedule[nextIndex]!.amount - paid[nextIndex]!), dueDate: next.dueDate } : null;
  const daysToDue = nextDue ? daysBetween(today, nextDue.dueDate) : null;
  const dueDate = finalDue;

  return {
    id: l._id.toString(),
    borrower,
    applicant: {
      fullName: l.applicant.fullName,
      pan: FULL_PAN_ROLES.includes(viewer) ? l.applicant.pan : maskPan(l.applicant.pan),
      dob: isoDate(l.applicant.dob),
      monthlySalary: toRupees(l.applicant.monthlySalary),
      employmentMode: l.applicant.employmentMode,
    },
    salarySlip: toDocumentDTO(l.salarySlip),
    panCard: toDocumentDTO(l.panCard),
    assignee: toActorDTO(l.assignee),
    principal: toRupees(l.principal),
    interestRate: l.interestRate,
    tenureDays: l.tenureDays,
    simpleInterest: toRupees(l.simpleInterest),
    totalRepayment: toRupees(l.totalRepayment),
    amountPaid: toRupees(l.amountPaid),
    outstanding: toRupees(l.totalRepayment - l.amountPaid),
    status: l.status,
    rejectionReason: l.rejectionReason,
    appliedAt: l.createdAt.toISOString(),
    sanctionedAt: l.sanctionedAt?.toISOString(),
    disbursedAt: l.disbursedAt?.toISOString(),
    repaymentPlan: l.repaymentPlan ?? 'ONE_TIME',
    emiMonths: l.emiMonths ?? null,
    instalments,
    nextDue,
    dueDate: dueDate ?? undefined,
    isOverdue: daysToDue !== null && daysToDue < 0 && l.status === 'DISBURSED',
    daysOverdue: daysToDue !== null && daysToDue < 0 && l.status === 'DISBURSED' ? -daysToDue : 0,
    daysToDue,
    closedAt: l.closedAt?.toISOString(),
    consent: { termsVersion: l.consent.termsVersion, acceptedAt: l.consent.acceptedAt.toISOString() },
    statusHistory: l.statusHistory.map((h) => ({
      from: h.from,
      to: h.to,
      by: toActorDTO(h.by),
      at: h.at.toISOString(),
      note: h.note,
    })),
  };
}

export const toPaymentDTO = (p: Omit<IPayment, 'recordedBy'> & { recordedBy: Ref<Pick<IUser, '_id' | 'name'>> }): PaymentDTO => ({
  id: p._id.toString(),
  loanId: p.loan.toString(),
  utr: p.utr,
  amount: toRupees(p.amount),
  paymentDate: isoDate(p.paymentDate),
  recordedBy: isPopulated(p.recordedBy) ? { id: p.recordedBy._id.toString(), name: p.recordedBy.name } : null,
  createdAt: p.createdAt.toISOString(),
});
