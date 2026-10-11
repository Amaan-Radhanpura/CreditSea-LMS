'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, CalendarClock, FilePlus2, MessageSquareWarning, Siren, Wallet } from 'lucide-react';
import { formatINR, type LoanDTO } from '@lms/shared';
import { LoanTimeline } from '@/components/LoanTimeline';
import { RepaymentSchedule } from '@/components/RepaymentSchedule';
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const NEXT_STEP: Record<LoanDTO['status'], string> = {
  APPLIED: 'Our team is checking your application. This usually takes 1 working day.',
  SANCTIONED: 'Your loan is approved! The money will be sent to your bank account soon.',
  DISBURSED: 'The money has been sent. Please pay back before the due date.',
  CLOSED: 'You have paid everything back. Thank you!',
  REJECTED: 'Sorry, we could not approve this loan.',
};

function LoanCard({ loan }: { loan: LoanDTO }) {
  const paidPct = Math.min(100, Math.round((loan.amountPaid / loan.totalRepayment) * 100));
  const showRepayment = loan.status === 'DISBURSED' || loan.status === 'CLOSED';

  return (
    <Card className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Applied on {formatDate(loan.appliedAt)}</p>
          <p className="text-3xl font-extrabold text-slate-900">{formatINR(loan.principal)}</p>
          <p className="text-slate-500">
            Pay back {formatINR(loan.totalRepayment)} ·{' '}
            {loan.repaymentPlan === 'EMI' ? `${loan.emiMonths} monthly EMIs of ${formatINR(loan.instalments[0]!.amount)}` : `${loan.tenureDays} days`} · {loan.interestRate}% p.a.
          </p>
        </div>
        <StatusBadge status={loan.status} className="text-base" />
      </div>

      {loan.isOverdue && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 ring-2 ring-rose-200">
          <Siren className="mt-0.5 size-7 shrink-0 text-rose-600" />
          <div>
            <p className="text-lg font-bold text-rose-700">
              {loan.nextDue && (loan.repaymentPlan === 'EMI' ? `EMI ${loan.nextDue!.number} of ${loan.emiMonths}` : 'Payment')} is {loan.daysOverdue} day{loan.daysOverdue === 1 ? '' : 's'} late
            </p>
            <p className="text-rose-700">
              Please pay <strong>{formatINR(loan.nextDue?.amount ?? loan.outstanding)}</strong> as soon as possible. It was due on {formatDate(loan.nextDue?.dueDate ?? loan.dueDate!)}.
            </p>
          </div>
        </div>
      )}
      {!loan.isOverdue && loan.status === 'DISBURSED' && loan.daysToDue !== null && loan.daysToDue <= 3 && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-2 ring-amber-200">
          <AlarmClock className="mt-0.5 size-7 shrink-0 text-amber-600" />
          <div>
            <p className="text-lg font-bold text-amber-800">
              {loan.nextDue && loan.repaymentPlan === 'EMI' ? `EMI ${loan.nextDue.number} of ${loan.emiMonths} ` : 'Payment '}
              {loan.daysToDue === 0 ? 'due today' : loan.daysToDue === 1 ? 'due tomorrow' : `due in ${loan.daysToDue} days`}
            </p>
            <p className="text-amber-800">
              Please pay <strong>{formatINR(loan.nextDue?.amount ?? loan.outstanding)}</strong> by {formatDate(loan.nextDue?.dueDate ?? loan.dueDate!)}.
            </p>
          </div>
        </div>
      )}

      <LoanTimeline loan={loan} />

      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-700 ring-1 ring-slate-100">{NEXT_STEP[loan.status]}</p>

      {loan.status === 'REJECTED' && loan.rejectionReason && (
        <p className="flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-rose-700 ring-1 ring-rose-100">
          <MessageSquareWarning className="mt-0.5 size-5 shrink-0" /> <span><strong>Reason:</strong> {loan.rejectionReason}</span>
        </p>
      )}

      {(loan.status === 'APPLIED' || loan.status === 'SANCTIONED' || loan.status === 'DISBURSED') && <RepaymentSchedule loan={loan} compact />}

      {showRepayment && (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
            <span className="text-emerald-700">Paid {formatINR(loan.amountPaid)}</span>
            <span className="text-slate-600">Left to pay {formatINR(loan.outstanding)}</span>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={paidPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${paidPct}%` }} />
          </div>
          {loan.dueDate && loan.status === 'DISBURSED' && (
            <p className="flex items-center gap-2 text-slate-600">
              <CalendarClock className="size-5 text-brand-600" /> Due date: <strong>{formatDate(loan.dueDate)}</strong>
              {loan.daysToDue !== null && loan.daysToDue > 0 && <span className="text-slate-500">({loan.daysToDue} days left)</span>}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function MyLoansPage() {
  const [loans, setLoans] = useState<LoanDTO[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get<LoanDTO[]>('/loans/me').then(setLoans).catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const hasOpenLoan = loans?.some((l) => ['APPLIED', 'SANCTIONED', 'DISBURSED'].includes(l.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-3xl font-extrabold text-slate-900">
          <Wallet className="size-8 text-brand-600" /> My loans
        </h1>
        {loans && !hasOpenLoan && (
          <Link href="/apply" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 font-semibold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700">
            <FilePlus2 className="size-5" /> Apply for a loan
          </Link>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !loans ? (
        <Skeleton className="h-80" />
      ) : loans.length === 0 ? (
        <EmptyState icon={<Wallet />} title="No loans yet" message="Apply in 3 easy steps. It takes about 5 minutes." />
      ) : (
        loans.map((loan) => <LoanCard key={loan.id} loan={loan} />)
      )}
    </div>
  );
}
