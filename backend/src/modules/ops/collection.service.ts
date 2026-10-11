import mongoose from 'mongoose';
import { formatINR, toBusinessDate, toPaise, toRupees, type PaymentDTO, type PaymentInput, type PaymentResultDTO } from '@lms/shared';
import type { AuthUser } from '../../types/express';
import { Loan, Payment, User } from '../../models';
import { ApiError } from '../../utils/ApiError';
import { findLoanDTO } from '../loans/loan.service';
import { recordAudit } from '../audit/audit.service';
import { notify } from '../notifications/notification.service';
import { assertAssignee, performTransition } from '../loans/loanWorkflow';
import { nextDue } from '../loans/schedule';
import { toPaymentDTO } from '../mappers';

export async function listPayments(loanId: string): Promise<PaymentDTO[]> {
  const payments = await Payment.find({ loan: loanId })
    .sort({ paymentDate: -1, createdAt: -1 })
    .populate('recordedBy', 'name')
    .lean();
  return payments.map((p) => toPaymentDTO(p as never));
}

/**
 * Records a payment against a DISBURSED loan, all-or-nothing in one transaction:
 *   1. insert the payment (the unique UTR index rejects duplicates)
 *   2. $inc amountPaid, but only if it can't exceed totalRepayment (guarded in the filter itself)
 *   3. if the balance hits zero, move the loan to CLOSED
 */
export async function recordPayment(loanId: string, input: PaymentInput, actor: AuthUser, ipAddress?: string): Promise<PaymentResultDTO> {
  const amount = toPaise(input.amount);
  const paymentDate = new Date(input.paymentDate);
  let paymentId = '';
  let loanClosed = false;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const loan = await Loan.findById(loanId).session(session).lean();
      if (!loan) throw ApiError.notFound('Loan not found');
      if (loan.assignee) {
        const assignee = await User.findById(loan.assignee).select('name').session(session).lean();
        assertAssignee(assignee, actor);
      }
      if (loan.status !== 'DISBURSED') {
        throw ApiError.conflict(`Payments can only be recorded for disbursed loans (this loan is ${loan.status.toLowerCase()})`, 'INVALID_LOAN_STATUS');
      }

      const outstanding = loan.totalRepayment - loan.amountPaid;
      if (amount > outstanding) {
        throw ApiError.badRequest(`Amount is more than the outstanding balance of ${formatINR(toRupees(outstanding))}`, { outstanding: toRupees(outstanding) }, 'OVERPAYMENT');
      }
      if (loan.disbursedAt && input.paymentDate < toBusinessDate(loan.disbursedAt)) {
        throw ApiError.badRequest('Payment date cannot be before the loan was disbursed', undefined, 'INVALID_PAYMENT_DATE');
      }

      const [payment] = await Payment.create([{ loan: loan._id, utr: input.utr, amount, paymentDate, recordedBy: actor.id }], { session });
      paymentId = payment!._id.toString();

      // The filter re-checks the balance atomically, so concurrent payments can never overpay.
      const updated = await Loan.findOneAndUpdate(
        { _id: loan._id, status: 'DISBURSED', $expr: { $lte: [{ $add: ['$amountPaid', amount] }, '$totalRepayment'] } },
        { $inc: { amountPaid: amount } },
        { new: true, session },
      ).lean();
      if (!updated) throw ApiError.conflict('The loan balance changed. Please refresh and try again', 'BALANCE_CHANGED');

      await recordAudit(
        {
          actor,
          action: 'PAYMENT_RECORDED',
          loanId,
          subjectUserId: loan.borrower,
          ipAddress,
          details: { utr: input.utr, amount: input.amount, paymentDate: input.paymentDate, outstandingAfter: toRupees(updated.totalRepayment - updated.amountPaid) },
        },
        session,
      );

      // Payments settle the oldest instalment first; move the "next due" pointer accordingly.
      await Loan.updateOne({ _id: loan._id }, { $set: nextDue(updated.instalments, updated.amountPaid) }, { session });

      const left = updated.totalRepayment - updated.amountPaid;
      await notify(
        [
          {
            user: loan.borrower,
            type: 'PAYMENT_RECEIVED',
            title: 'Payment received',
            message: `We received ${formatINR(input.amount)} (UTR ${input.utr}).${left > 0 ? ` ${formatINR(toRupees(left))} left to pay.` : ''}`,
            loan: loan._id,
          },
        ],
        session,
      );

      if (updated.amountPaid === updated.totalRepayment) {
        await performTransition(loanId, 'CLOSE', { id: actor.id, role: 'SYSTEM' }, session, { note: 'Auto-closed: loan fully repaid' });
        loanClosed = true;
      }
    });
  } finally {
    await session.endSession();
  }

  const [payment, loan] = await Promise.all([
    Payment.findById(paymentId).populate('recordedBy', 'name').lean(),
    findLoanDTO(loanId, actor.role),
  ]);
  return { payment: toPaymentDTO(payment as never), loan, loanClosed };
}
