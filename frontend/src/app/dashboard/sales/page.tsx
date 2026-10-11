'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, FileCheck2, UserPlus, XCircle } from 'lucide-react';
import { formatINR, type LeadDTO, type LeadStage } from '@lms/shared';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader } from '@/components/dashboard/DashboardShell';
import { UserDrawer } from '@/components/dashboard/UserDrawer';
import { Pagination, SearchBox, Tabs } from '@/components/dashboard/ListControls';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { usePaginated } from '@/hooks/usePaginated';
import { EMPLOYMENT_LABEL, cn, formatDate } from '@/lib/utils';

const STAGE_META: Record<LeadStage, { label: string; hint: string; icon: typeof UserPlus; className: string }> = {
  REGISTERED: { label: 'Details missing', hint: 'Older account without personal details', icon: UserPlus, className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  PROFILE_REJECTED: { label: 'Not eligible', hint: 'Failed eligibility checks', icon: XCircle, className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  PROFILE_COMPLETED: { label: 'Documents missing', hint: 'Eligible, but a document is missing', icon: CheckCircle2, className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  SLIP_UPLOADED: { label: 'Ready to apply', hint: 'Eligible with both documents. Call to help them apply', icon: FileCheck2, className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

type StageFilter = LeadStage | 'ALL';

function StageBadge({ stage }: { stage: LeadStage }) {
  const m = STAGE_META[stage];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset', m.className)}>
      <m.icon className="size-4" /> {m.label}
    </span>
  );
}

export default function SalesPage() {
  const [stage, setStage] = useState<StageFilter>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const isAdmin = useAuth().user?.role === 'ADMIN';
  const { data, error, loading, reload } = usePaginated<LeadDTO>('/sales/leads', {
    stage: stage === 'ALL' ? undefined : stage,
    search,
    page,
    limit: 10,
  });

  return (
    <>
      <PageHeader module="sales" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs<StageFilter>
          tabs={[{ value: 'ALL', label: 'All leads' }, ...(Object.keys(STAGE_META) as LeadStage[]).map((s) => ({ value: s, label: STAGE_META[s].label }))]}
          value={stage}
          onChange={(v) => {
            setStage(v);
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
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<UserPlus />} title="No leads here" message="Everyone in this list has already applied for a loan." />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.items.map((lead) => (
              <div
                key={lead.id}
                role={isAdmin ? 'button' : undefined}
                tabIndex={isAdmin ? 0 : undefined}
                onClick={isAdmin ? () => setOpenUser(lead.id) : undefined}
                onKeyDown={isAdmin ? (e) => e.key === 'Enter' && setOpenUser(lead.id) : undefined}
                className={cn('rounded-3xl bg-white p-5 ring-1 ring-slate-200', isAdmin && 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-brand-200')}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-slate-900">{lead.fullName ?? lead.name}</p>
                    <p className="truncate text-slate-500">{lead.email}</p>
                  </div>
                  <StageBadge stage={lead.stage} />
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                  <span>Signed up {formatDate(lead.registeredAt)}</span>
                  {lead.monthlySalary !== undefined && <span>Salary {formatINR(lead.monthlySalary)}/mo</span>}
                  {lead.employmentMode && <span>{EMPLOYMENT_LABEL[lead.employmentMode]}</span>}
                </div>
                <p className="mt-3 flex items-center justify-between text-sm font-medium text-slate-500">
                  {STAGE_META[lead.stage].hint}
                  {isAdmin && (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-brand-600">
                      View details <ChevronRight className="size-4" />
                    </span>
                  )}
                </p>
                {lead.breFailures && lead.breFailures.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">
                    {lead.breFailures.map((f) => (
                      <li key={f.rule}>• {f.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}
      <UserDrawer userId={openUser} onClose={() => setOpenUser(null)} />
    </>
  );
}
