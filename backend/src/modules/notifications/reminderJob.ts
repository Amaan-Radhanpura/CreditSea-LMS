import { OVERDUE_REMINDER_DAYS, daysBetween, formatINR, toBusinessDate, toRupees, type ReminderRunDTO } from '@lms/shared';
import { Loan } from '../../models';
import { isoDate } from '../../utils/http';
import { logger } from '../../utils/logger';
import { notify, type NewNotification } from './notification.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Overdue reminders go out on day 1, 3, 7 past due, then every 7 days. */
export const isOverdueReminderDay = (daysOverdue: number): boolean => {
  const last = Math.max(...OVERDUE_REMINDER_DAYS);
  return (OVERDUE_REMINDER_DAYS as readonly number[]).includes(daysOverdue) || (daysOverdue > last && daysOverdue % 7 === 0);
};

/**
 * Scans disbursed loans and creates:
 *  - DUE_REMINDER for loans due tomorrow (≈24h notice)
 *  - OVERDUE for borrowers, and OVERDUE_ALERT for the assigned collection executive, on reminder days
 * Every notification carries a dedupeKey (loan + date), so running this hourly, on restart, or on
 * several servers never sends the same reminder twice. Queries use the { status, nextDueDate } index,
 * so for EMI loans every instalment gets its own reminders.
 */
export async function runReminderJob(now: Date = new Date()): Promise<ReminderRunDTO> {
  const today = toBusinessDate(now);
  const tomorrow = toBusinessDate(new Date(now.getTime() + DAY_MS));
  const fields = 'borrower assignee applicant.fullName repaymentPlan instalments nextDueDate nextDueAmount';

  const [dueTomorrow, overdue] = await Promise.all([
    Loan.find({ status: 'DISBURSED', nextDueDate: new Date(tomorrow) }).select(fields).lean(),
    Loan.find({ status: 'DISBURSED', nextDueDate: { $lt: new Date(today) } }).select(fields).lean(),
  ]);

  /** "EMI 2 of 6" for EMI loans, "Payment" for one-time loans; and which instalment is next. */
  const describe = (l: (typeof dueTomorrow)[number]) => {
    const no = l.instalments.find((i) => i.dueDate && isoDate(i.dueDate) === isoDate(l.nextDueDate!))?.number ?? 1;
    return { no, label: l.repaymentPlan === 'EMI' ? `EMI ${no} of ${l.instalments.length}` : 'Payment', amount: formatINR(toRupees(l.nextDueAmount ?? 0)) };
  };

  const due: NewNotification[] = dueTomorrow.map((l) => {
    const d = describe(l);
    return {
      user: l.borrower,
      type: 'DUE_REMINDER',
      title: `${d.label} due tomorrow`,
      message: `Please pay ${d.amount} by tomorrow to avoid a late payment.`,
      loan: l._id,
      dedupeKey: `due:${l._id}:${d.no}:${tomorrow}`,
    };
  });

  const borrowerOverdue: NewNotification[] = [];
  const staffAlerts: NewNotification[] = [];
  for (const l of overdue) {
    const days = daysBetween(isoDate(l.nextDueDate!), today);
    if (!isOverdueReminderDay(days)) continue;
    const d = describe(l);
    const outstanding = d.amount;
    borrowerOverdue.push({
      user: l.borrower,
      type: 'OVERDUE',
      title: `${d.label} overdue by ${days} day${days === 1 ? '' : 's'}`,
      message: `${outstanding} is still pending. Please pay as soon as possible.`,
      loan: l._id,
      dedupeKey: `overdue:${l._id}:${d.no}:${days}`,
    });
    if (l.assignee) {
      staffAlerts.push({
        user: l.assignee,
        type: 'OVERDUE_ALERT',
        title: `${l.applicant.fullName}: ${d.label.toLowerCase()} ${days} day${days === 1 ? '' : 's'} overdue`,
        message: `${outstanding} pending. Please follow up with the borrower.`,
        loan: l._id,
        dedupeKey: `overdue-alert:${l._id}:${d.no}:${days}`,
      });
    }
  }

  const [dueReminders, overdueReminders, staff] = await Promise.all([notify(due), notify(borrowerOverdue), notify(staffAlerts)]);
  const result = { dueReminders, overdueReminders, staffAlerts: staff, ranAt: now.toISOString() };
  logger.info(result, 'Reminder job finished');
  return result;
}

/** Runs the job now and then every `intervalMinutes`. Returns a stop function. */
export function startReminderScheduler(intervalMinutes = 60): () => void {
  const run = () => runReminderJob().catch((err) => logger.error({ err }, 'Reminder job failed'));
  void run();
  const timer = setInterval(run, intervalMinutes * 60 * 1000);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
