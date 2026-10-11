import type { FilterQuery } from 'mongoose';
import type { ExecutiveRole, LoanStatus, Role } from '@lms/shared';
import { Loan, type ILoan } from '../../models';
import { ApiError } from '../../utils/ApiError';

/**
 * Which loans an executive may see: only their own work. A loan that is waiting for them
 * (they are the current assignee) or one they personally handled at their stage.
 * Admin sees everything. Anything else is reported as "not found" so its existence isn't revealed.
 */
const OWN_LOANS: Partial<Record<ExecutiveRole, (userId: string) => FilterQuery<ILoan>>> = {
  SANCTION: (uid) => ({ $or: [{ status: 'APPLIED', assignee: uid }, { sanctionedBy: uid }, { rejectedBy: uid }] }),
  DISBURSEMENT: (uid) => ({ $or: [{ status: 'SANCTIONED', assignee: uid }, { disbursedBy: uid }] }),
  // The collector stays the assignee after the loan closes, so their Closed tab keeps it.
  COLLECTION: (uid) => ({ status: { $in: ['DISBURSED', 'CLOSED'] }, assignee: uid }),
};

/** Mongo filter limiting loans to what `viewer` may see ({} for Admin). */
export function visibleLoansFilter(viewer: { id: string; role: Role }): FilterQuery<ILoan> {
  if (viewer.role === 'ADMIN') return {};
  const own = OWN_LOANS[viewer.role as ExecutiveRole];
  // Roles without a loan module (Sales, Borrower) see no loans through the ops endpoints.
  return own ? own(viewer.id) : { _id: null };
}

/** 404 unless the loan is in this module's statuses AND visible to the viewer. */
export async function assertCanSeeLoan(loanId: string, viewer: { id: string; role: Role }, scope?: readonly LoanStatus[]): Promise<void> {
  const found = await Loan.exists({ $and: [{ _id: loanId }, scope ? { status: { $in: scope } } : {}, visibleLoansFilter(viewer)] });
  if (!found) throw ApiError.notFound('Loan not found');
}
