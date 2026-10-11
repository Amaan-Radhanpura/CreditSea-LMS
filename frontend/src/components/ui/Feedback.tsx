import { AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-200/70', className)} />;
}

export function EmptyState({ title, message, icon }: { title: string; message?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-14 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-400 [&>svg]:size-8">{icon ?? <Inbox />}</div>
      <p className="text-lg font-semibold text-slate-700">{title}</p>
      {message && <p className="mt-1 max-w-sm text-slate-500">{message}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-rose-50 px-6 py-10 text-center ring-1 ring-rose-100">
      <AlertTriangle className="mb-3 size-10 text-rose-500" aria-hidden />
      <p className="font-semibold text-rose-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-7', className)}>{children}</div>;
}
