import { Banknote, CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';
import type { LoanStatus } from '@lms/shared';
import { cn } from '@/lib/utils';

/** Colour + icon + word: status is never communicated by colour alone. */
export const STATUS_META: Record<LoanStatus, { label: string; className: string; icon: typeof Clock; dot: string }> = {
  APPLIED: { label: 'Under review', className: 'bg-amber-50 text-amber-700 ring-amber-200', icon: Clock, dot: 'bg-amber-500' },
  SANCTIONED: { label: 'Approved', className: 'bg-sky-50 text-sky-700 ring-sky-200', icon: CheckCircle2, dot: 'bg-sky-500' },
  REJECTED: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 ring-rose-200', icon: XCircle, dot: 'bg-rose-500' },
  DISBURSED: { label: 'Money sent', className: 'bg-violet-50 text-violet-700 ring-violet-200', icon: Banknote, dot: 'bg-violet-500' },
  CLOSED: { label: 'Closed (paid)', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: Lock, dot: 'bg-emerald-500' },
};

export function StatusBadge({ status, className }: { status: LoanStatus; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset', meta.className, className)}>
      <Icon className="size-4" aria-hidden />
      {meta.label}
    </span>
  );
}
