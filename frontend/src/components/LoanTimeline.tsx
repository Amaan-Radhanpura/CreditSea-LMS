import { Banknote, CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';
import type { LoanDTO, LoanStatus } from '@lms/shared';
import { cn, formatDateTime } from '@/lib/utils';

const HAPPY_PATH: { status: LoanStatus; label: string; icon: typeof Clock }[] = [
  { status: 'APPLIED', label: 'Applied', icon: Clock },
  { status: 'SANCTIONED', label: 'Approved', icon: CheckCircle2 },
  { status: 'DISBURSED', label: 'Money sent', icon: Banknote },
  { status: 'CLOSED', label: 'Fully paid', icon: Lock },
];

/** Horizontal on desktop, vertical on phones. Rejected loans end with a red step. */
export function LoanTimeline({ loan }: { loan: LoanDTO }) {
  const reached = new Map(loan.statusHistory.map((h) => [h.to, h]));
  const steps =
    loan.status === 'REJECTED'
      ? [HAPPY_PATH[0]!, { status: 'REJECTED' as const, label: 'Rejected', icon: XCircle }]
      : HAPPY_PATH;

  return (
    <ol className="flex flex-col gap-0 sm:flex-row">
      {steps.map((s, i) => {
        const event = reached.get(s.status);
        const isRejected = s.status === 'REJECTED';
        const isCurrent = loan.status === s.status;
        return (
          <li key={s.status} className="relative flex flex-1 gap-3 pb-6 sm:flex-col sm:items-center sm:pb-0 sm:text-center">
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'absolute top-12 left-6 h-[calc(100%-3rem)] w-1 -translate-x-1/2 rounded-full sm:top-6 sm:left-[calc(50%+1.75rem)] sm:h-1 sm:w-[calc(100%-3.5rem)] sm:translate-x-0',
                  reached.has(steps[i + 1]!.status) ? 'bg-emerald-400' : 'bg-slate-200',
                )}
              />
            )}
            <span
              className={cn(
                'relative grid size-12 shrink-0 place-items-center rounded-2xl',
                event ? (isRejected ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white') : 'bg-slate-100 text-slate-400',
                isCurrent && !isRejected && loan.status !== 'CLOSED' && 'ring-4 ring-emerald-100',
              )}
            >
              <s.icon className="size-6" />
            </span>
            <div className="sm:mt-2">
              <p className={cn('font-bold', event ? (isRejected ? 'text-rose-700' : 'text-slate-800') : 'text-slate-400')}>{s.label}</p>
              {event && <p className="text-sm text-slate-500">{formatDateTime(event.at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
