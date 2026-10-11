'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CircleUserRound,
  FilePlus2,
  HandCoins,
  Landmark,
  PiggyBank,
  Siren,
  Wallet,
} from 'lucide-react';
import { formatINR, type BorrowerStateDTO, type LoanDTO } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { LoanCalculator } from '@/components/borrower/LoanCalculator';
import { LoanTimeline } from '@/components/LoanTimeline';
import { RepaymentSchedule } from '@/components/RepaymentSchedule';
import { Card, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

interface HomeData {
  state: BorrowerStateDTO;
  loans: LoanDTO[];
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const btn = 'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition';

function Hero({ name, data }: { name: string; data: HomeData }) {
  const { state } = data;
  const open = data.loans.find((l) => l.id === state.openLoanId);
  const cta =
    state.step === 'LOAN_CONFIG'
      ? { href: '/apply', label: 'Apply for a loan', icon: FilePlus2, text: 'You are eligible. Choose an amount and get money in your bank.' }
      : state.step === 'HAS_OPEN_LOAN'
        ? { href: '/my-loans', label: 'View my loan', icon: Wallet, text: open?.isOverdue ? 'Your payment is late. Please pay as soon as possible.' : 'Your loan is in progress. We will notify you of every update.' }
        : { href: '/profile', label: 'Complete my profile', icon: CircleUserRound, text: state.step === 'NOT_ELIGIBLE' ? 'You are not eligible right now. Check your details.' : 'Add your details and documents to apply.' };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-6 text-white shadow-xl shadow-brand-700/20 sm:p-8">
      <div className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-brand-100">{greeting()},</p>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{name} 👋</h1>
          <p className="mt-2 max-w-lg text-brand-100">{cta.text}</p>
        </div>
        <Link href={cta.href} className={`${btn} h-14 bg-white px-6 text-lg text-brand-700 shadow-lg hover:bg-brand-50`}>
          <cta.icon className="size-5" /> {cta.label}
        </Link>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
      <span className={cn('grid size-11 place-items-center rounded-2xl', tone)}>
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-sm text-slate-500">{label}</p>
      <p className="text-xl font-extrabold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

function CurrentLoan({ loan }: { loan: LoanDTO }) {
  const paidPct = Math.min(100, (loan.amountPaid / loan.totalRepayment) * 100);
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">Current loan</p>
          <p className="text-3xl font-extrabold text-slate-900">{formatINR(loan.principal)}</p>
          <p className="text-slate-500">
            Pay back {formatINR(loan.totalRepayment)} ·{' '}
            {loan.repaymentPlan === 'EMI' ? `${loan.emiMonths} monthly EMIs` : `${loan.tenureDays} days`}
          </p>
        </div>
        <StatusBadge status={loan.status} className="text-base" />
      </div>

      {loan.isOverdue && (
        <p className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-700 ring-1 ring-rose-200">
          <Siren className="size-5" /> {loan.nextDue && (loan.repaymentPlan === 'EMI' ? `EMI ${loan.nextDue!.number} of ${loan.emiMonths}` : 'Payment')} is {loan.daysOverdue} day{loan.daysOverdue === 1 ? '' : 's'} late. Please pay{' '}
          {formatINR(loan.nextDue?.amount ?? loan.outstanding)}.
        </p>
      )}
      {!loan.isOverdue && loan.daysToDue !== null && loan.daysToDue <= 3 && loan.status === 'DISBURSED' && (
        <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 font-semibold text-amber-800 ring-1 ring-amber-200">
          <AlarmClock className="size-5" /> {loan.nextDue && (loan.repaymentPlan === 'EMI' ? `EMI ${loan.nextDue!.number} of ${loan.emiMonths}` : 'Payment')}{' '}
          {loan.daysToDue === 0 ? 'due today' : loan.daysToDue === 1 ? 'due tomorrow' : `due in ${loan.daysToDue} days`}: {formatINR(loan.nextDue?.amount ?? loan.outstanding)}
        </p>
      )}

      <LoanTimeline loan={loan} />

      {loan.status === 'DISBURSED' && (
        <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">Paid</p>
            <p className="text-lg font-bold text-emerald-600 tabular-nums">{formatINR(loan.amountPaid)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Left to pay</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{formatINR(loan.outstanding)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-sm text-slate-500">
              <CalendarClock className="size-4" /> Next payment
            </p>
            <p className="text-lg font-bold text-slate-900">
              {loan.nextDue ? `${formatINR(loan.nextDue.amount)} · ${formatDate(loan.nextDue.dueDate)}` : '—'}
            </p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200 sm:col-span-3">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${paidPct}%` }} />
          </div>
        </div>
      )}

      {loan.repaymentPlan === 'EMI' && <RepaymentSchedule loan={loan} compact />}

      <Link href="/my-loans" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
        See full details <ArrowRight className="size-4" />
      </Link>
    </Card>
  );
}

function History({ loans }: { loans: LoanDTO[] }) {
  if (loans.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <Wallet className="size-5 text-brand-600" /> My loan history
        </h2>
        <Link href="/my-loans" className="text-sm font-semibold text-brand-600 hover:underline">
          View all
        </Link>
      </div>
      <ul className="mt-4 divide-y divide-slate-100">
        {loans.slice(0, 5).map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 tabular-nums">{formatINR(l.principal)}</p>
              <p className="text-sm text-slate-500">
                {formatDate(l.appliedAt)} · {l.tenureDays} days · pay back {formatINR(l.totalRepayment)}
              </p>
            </div>
            <StatusBadge status={l.status} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Borrower home: everything at a glance, with one clear next action. */
export default function BorrowerHomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    Promise.all([api.get<BorrowerStateDTO>('/borrower/state'), api.get<LoanDTO[]>('/loans/me')])
      .then(([state, loans]) => setData({ state, loans }))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const openLoan = data.loans.find((l) => l.id === data.state.openLoanId);
  const funded = data.loans.filter((l) => l.status === 'DISBURSED' || l.status === 'CLOSED');
  const borrowed = funded.reduce((s, l) => s + l.principal, 0);
  const repaid = data.loans.reduce((s, l) => s + l.amountPaid, 0);
  const outstanding = funded.reduce((s, l) => s + (l.status === 'DISBURSED' ? l.outstanding : 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <Hero name={(data.state.profile?.fullName ?? user?.name ?? '').split(' ')[0]!} data={data} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Landmark} label="Total borrowed" value={formatINR(borrowed)} tone="bg-brand-50 text-brand-600" />
        <Stat icon={PiggyBank} label="Total repaid" value={formatINR(repaid)} tone="bg-emerald-50 text-emerald-600" />
        <Stat icon={HandCoins} label="Left to pay" value={formatINR(outstanding)} tone="bg-amber-50 text-amber-600" />
        <Stat icon={Wallet} label="Loans taken" value={String(data.loans.length)} tone="bg-violet-50 text-violet-600" />
      </div>

      {/* No open loan: the welcome banner above already offers "Apply for a loan". */}
      {openLoan && <CurrentLoan loan={openLoan} />}
      <LoanCalculator canApply={data.state.step === 'LOAN_CONFIG'} />
      <History loans={data.loans} />
    </div>
  );
}
