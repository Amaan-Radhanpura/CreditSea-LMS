import { AlertCircle, CheckCircle2, CircleDashed, Clock, Repeat, Wallet } from 'lucide-react';
import { formatINR, type InstalmentStatus, type LoanDTO } from '@lms/shared';
import { cn, formatDate } from '@/lib/utils';

const STATUS: Record<InstalmentStatus, { label: string; className: string; icon: typeof Clock }> = {
  PAID: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2 },
  PARTLY_PAID: { label: 'Partly paid', className: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Clock },
  OVERDUE: { label: 'Overdue', className: 'bg-rose-50 text-rose-700 ring-rose-200', icon: AlertCircle },
  DUE: { label: 'Next to pay', className: 'bg-brand-50 text-brand-700 ring-brand-200', icon: Clock },
  UPCOMING: { label: 'Upcoming', className: 'bg-slate-50 text-slate-500 ring-slate-200', icon: CircleDashed },
};

/** EMI / one-time repayment schedule with per-instalment status. Works for borrowers and staff. */
export function RepaymentSchedule({ loan, compact }: { loan: LoanDTO; compact?: boolean }) {
  const isEmi = loan.repaymentPlan === 'EMI';
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 font-semibold text-slate-700">
        {isEmi ? <Repeat className="size-5 text-brand-600" /> : <Wallet className="size-5 text-brand-600" />}
        {isEmi ? `${loan.emiMonths} monthly EMIs` : 'One payment at the end'}
        {!loan.disbursedAt && <span className="text-sm font-normal text-slate-400">· dates are set when the money is sent</span>}
      </p>
      <ol className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200">
        {loan.instalments.map((inst) => {
          const s = STATUS[inst.status];
          return (
            <li key={inst.number} className={cn('flex flex-wrap items-center gap-3 px-4', compact ? 'py-2.5' : 'py-3', inst.status === 'OVERDUE' && 'bg-rose-50/50')}>
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">{inst.number}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 tabular-nums">{formatINR(inst.amount)}</p>
                <p className="text-sm text-slate-500">
                  {inst.dueDate ? `Due ${formatDate(inst.dueDate)}` : isEmi ? `Month ${inst.number}` : `${loan.tenureDays} days after disbursement`}
                  {inst.status === 'PARTLY_PAID' && ` · ${formatINR(inst.paid)} paid`}
                </p>
              </div>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset', s.className)}>
                <s.icon className="size-4" /> {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
