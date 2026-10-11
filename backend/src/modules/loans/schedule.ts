import { EMI_RULES, allocatePayments, splitInstalments, toBusinessDate, type RepaymentPlan } from '@lms/shared';
import type { IInstalment } from '../../models';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Repayment schedule. A one-time loan is simply a schedule with a single instalment, so every
 * piece of code (allocation, reminders, overdue) works the same way for both plans.
 * Amounts are fixed at apply time; due dates are filled in at disbursement.
 */
export function buildSchedule(plan: RepaymentPlan, totalPaise: number, emiMonths: number | null): IInstalment[] {
  const count = plan === 'EMI' ? emiMonths! : 1;
  return splitInstalments(totalPaise, count).map((amount, i) => ({ number: i + 1, amount, dueDate: null }));
}

/** IST business-date due dates counted from disbursement: every 30 days for EMI, end of tenure for one-time. */
export function withDueDates(instalments: IInstalment[], plan: RepaymentPlan, tenureDays: number, disbursedAt: Date): IInstalment[] {
  return instalments.map((inst, i) => {
    const days = plan === 'EMI' ? (i + 1) * EMI_RULES.DAYS_PER_MONTH : tenureDays;
    return { ...inst, dueDate: new Date(toBusinessDate(new Date(disbursedAt.getTime() + days * DAY_MS))) };
  });
}

/**
 * The next unpaid instalment (date + amount still owed on it), stored on the loan as
 * nextDueDate / nextDueAmount so reminders and the Overdue tab are a single indexed query.
 */
export function nextDue(instalments: IInstalment[], amountPaidPaise: number): { nextDueDate: Date | null; nextDueAmount: number | null } {
  const { paid, nextIndex } = allocatePayments(
    instalments.map((i) => i.amount),
    amountPaidPaise,
  );
  const next = instalments[nextIndex];
  if (nextIndex < 0 || !next?.dueDate) return { nextDueDate: null, nextDueAmount: null };
  return { nextDueDate: next.dueDate, nextDueAmount: next.amount - paid[nextIndex]! };
}
