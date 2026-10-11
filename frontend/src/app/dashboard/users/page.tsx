'use client';

import { useState } from 'react';
import { Activity, Briefcase, ChevronRight, Users } from 'lucide-react';
import type { Role, UserSummaryDTO } from '@lms/shared';
import { PageHeader } from '@/components/dashboard/DashboardShell';
import { Pagination, SearchBox, Tabs } from '@/components/dashboard/ListControls';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { usePaginated } from '@/hooks/usePaginated';
import { UserAvatar } from '@/components/dashboard/UserAvatar';
import { UserDrawer } from '@/components/dashboard/UserDrawer';
import { ROLE_LABEL, ROLE_TONE } from '@/lib/roles';
import { cn, formatDateTime } from '@/lib/utils';

type RoleFilter = Role | 'ALL';
const FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'SALES', label: 'Sales' },
  { value: 'SANCTION', label: 'Sanction' },
  { value: 'DISBURSEMENT', label: 'Disbursement' },
  { value: 'COLLECTION', label: 'Collection' },
  { value: 'BORROWER', label: 'Borrowers' },
  { value: 'ADMIN', label: 'Admin' },
];

export default function UsersPage() {
  const [role, setRole] = useState<RoleFilter>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const { data, error, loading, reload } = usePaginated<UserSummaryDTO>('/admin/users', {
    role: role === 'ALL' ? undefined : role,
    search,
    page,
  });

  return (
    <>
      <PageHeader title="Users" description="Every account and its full activity history, for audit and compliance" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={FILTERS}
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        />
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search name or email"
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<Users />} title="No users found" />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((u) => (
              <button
                key={u.id}
                onClick={() => setOpenUser(u.id)}
                className="group rounded-3xl bg-white p-5 text-left ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-brand-200"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar user={u} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{u.name}</p>
                    <p className="truncate text-sm text-slate-500">{u.email}</p>
                  </div>
                  <ChevronRight className="size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-500" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className={cn('rounded-lg px-2 py-0.5 font-semibold', ROLE_TONE[u.role])}>{ROLE_LABEL[u.role]}</span>
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    <Activity className="size-4" /> {u.actionCount} actions
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    <Briefcase className="size-4" /> {u.loanCount} {u.role === 'BORROWER' ? 'loans' : 'open assigned'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">{u.lastActiveAt ? `Last active ${formatDateTime(u.lastActiveAt)}` : 'No activity yet'}</p>
              </button>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}
      <UserDrawer userId={openUser} onClose={() => setOpenUser(null)} />
    </>
  );
}
