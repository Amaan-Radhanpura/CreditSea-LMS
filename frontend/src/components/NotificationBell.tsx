'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlarmClock, Banknote, Bell, CheckCircle2, FilePlus2, HandCoins, Lock, Siren, UserCheck, XCircle, type LucideIcon } from 'lucide-react';
import type { NotificationListDTO, NotificationType } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

const META: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  LOAN_APPLIED: { icon: FilePlus2, tone: 'bg-amber-100 text-amber-700' },
  DUE_REMINDER: { icon: AlarmClock, tone: 'bg-amber-100 text-amber-700' },
  OVERDUE: { icon: Siren, tone: 'bg-rose-100 text-rose-700' },
  OVERDUE_ALERT: { icon: Siren, tone: 'bg-rose-100 text-rose-700' },
  LOAN_SANCTIONED: { icon: CheckCircle2, tone: 'bg-sky-100 text-sky-700' },
  LOAN_REJECTED: { icon: XCircle, tone: 'bg-rose-100 text-rose-700' },
  LOAN_DISBURSED: { icon: Banknote, tone: 'bg-violet-100 text-violet-700' },
  PAYMENT_RECEIVED: { icon: HandCoins, tone: 'bg-emerald-100 text-emerald-700' },
  LOAN_CLOSED: { icon: Lock, tone: 'bg-emerald-100 text-emerald-700' },
  LOAN_ASSIGNED: { icon: UserCheck, tone: 'bg-indigo-100 text-indigo-700' },
};

const POLL_MS = 30_000;

/** Bell with unread badge + dropdown. Polls every minute while the tab is visible. */
export function NotificationBell({ align = 'right', dark }: { align?: 'left' | 'right'; dark?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<NotificationListDTO | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    api.get<NotificationListDTO>('/notifications').then(setData).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', load);
    };
  }, [user, load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) return null;
  const unread = data?.unread ?? 0;

  async function openItem(id: string) {
    setData(await api.patch<NotificationListDTO>(`/notifications/${id}/read`));
    setOpen(false);
    router.push(user!.role === 'BORROWER' ? '/my-loans' : user!.role === 'ADMIN' ? '/dashboard' : `/dashboard/${user!.role.toLowerCase()}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn('relative rounded-xl p-2.5 transition', dark ? 'text-brand-100 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100')}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell className="size-6" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white ring-2 ring-white animate-pop">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'fixed inset-x-3 top-18 z-50 overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 animate-fade-in sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-96',
            align === 'right' ? 'sm:right-0' : 'sm:left-0',
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-bold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button
                onClick={async () => setData(await api.patch<NotificationListDTO>('/notifications/read-all'))}
                className="text-sm font-semibold text-brand-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60dvh] divide-y divide-slate-100 overflow-y-auto">
            {!data || data.items.length === 0 ? (
              <li className="px-4 py-10 text-center text-slate-500">You&apos;re all caught up</li>
            ) : (
              data.items.map((n) => {
                const m = META[n.type];
                return (
                  <li key={n.id}>
                    <button onClick={() => openItem(n.id)} className={cn('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50', !n.read && 'bg-brand-50/40')}>
                      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', m.tone)}>
                        <m.icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{n.title}</span>
                          {!n.read && <span className="size-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" />}
                        </span>
                        <span className="block text-sm text-slate-600">{n.message}</span>
                        <span className="block text-xs text-slate-400">{formatDateTime(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
