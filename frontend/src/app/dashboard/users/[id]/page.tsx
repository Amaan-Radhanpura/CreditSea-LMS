'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Briefcase, CalendarDays, History, Mail } from 'lucide-react';
import type { UserSummaryDTO } from '@lms/shared';
import { AuditFeed } from '@/components/dashboard/AuditFeed';
import { UserAvatar } from '@/components/dashboard/UserAvatar';
import { Card, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { api, errorMessage } from '@/lib/api';
import { ROLE_LABEL, ROLE_TONE } from '@/lib/roles';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<UserSummaryDTO | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get<UserSummaryDTO>(`/admin/users/${id}`).then(setUser).catch((err) => setError(errorMessage(err)));
  }, [id]);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/users" className="inline-flex items-center gap-2 font-semibold text-slate-600 hover:text-brand-700">
        <ArrowLeft className="size-5" /> All users
      </Link>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !user ? (
        <Skeleton className="h-40" />
      ) : (
        <Card className="animate-fade-in">
          <div className="flex flex-wrap items-center gap-4">
            <UserAvatar user={user} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold text-slate-900">{user.name}</h1>
              <p className="flex items-center gap-1.5 text-slate-500">
                <Mail className="size-4" /> {user.email}
              </p>
            </div>
            <span className={cn('rounded-xl px-3 py-1 font-semibold', ROLE_TONE[user.role])}>{ROLE_LABEL[user.role]}</span>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-4">
            {[
              { icon: Activity, label: 'Actions taken', value: String(user.actionCount) },
              { icon: Briefcase, label: user.role === 'BORROWER' ? 'Loans applied' : 'Open loans assigned', value: String(user.loanCount) },
              { icon: CalendarDays, label: 'Account created', value: formatDate(user.createdAt) },
              { icon: History, label: 'Last active', value: user.lastActiveAt ? formatDateTime(user.lastActiveAt) : '—' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-slate-50 p-4">
                <dt className="flex items-center gap-1.5 text-sm text-slate-500">
                  <s.icon className="size-4" /> {s.label}
                </dt>
                <dd className="mt-1 text-lg font-bold text-slate-900">{s.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <History className="size-5 text-brand-600" /> History
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          {user?.role === 'BORROWER'
            ? 'Everything this borrower did, and everything our team did on their loans.'
            : 'Every action this person took, newest first. Entries cannot be edited or deleted.'}
        </p>
        <AuditFeed path={`/admin/users/${id}/activity`} linkUsers />
      </Card>
    </div>
  );
}
