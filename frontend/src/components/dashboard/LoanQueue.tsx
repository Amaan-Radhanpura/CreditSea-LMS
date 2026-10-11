'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { formatINR, type LoanDTO, type LoanStatus } from '@lms/shared';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePaginated } from '@/hooks/usePaginated';
import { formatDate } from '@/lib/utils';
import { Pagination, SearchBox, Tabs } from './ListControls';

export interface QueueTab {
  value: string;
  label: string;
  status: LoanStatus;
  /** Only disbursed loans past their due date. */
  overdue?: boolean;
}

/** Red "Overdue · N days" or amber "Due tomorrow / in N days" chip for disbursed loans. */
export function DueChip({ loan }: { loan: LoanDTO }) {
  if (loan.status !== 'DISBURSED' || loan.daysToDue === null) return null;
  if (loan.isOverdue) {
    return <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">Overdue · {loan.daysOverdue}d</span>;
  }
  if (loan.daysToDue <= 3) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
        {loan.daysToDue === 0 ? 'Due today' : loan.daysToDue === 1 ? 'Due tomorrow' : `Due in ${loan.daysToDue}d`}
      </span>
    );
  }
  return null;
}

interface Props {
  module: 'sanction' | 'disbursement' | 'collection';
  tabs: QueueTab[];
  actionLabel: (loan: LoanDTO) => string;
  showRepayment?: boolean;
  /** Renders the detail modal for the selected loan. Call `done()` after an action to refresh the list. */
  renderDetail: (loan: LoanDTO, close: () => void, done: () => void) => React.ReactNode;
}

/** Paginated, searchable loan queue used by Sanction, Disbursement and Collection: a table on desktop, cards on phones. */
export function LoanQueue({ module, tabs, actionLabel, showRepayment, renderDetail }: Props) {
  const [tabValue, setTabValue] = useState(tabs[0]!.value);
  const tab = tabs.find((t) => t.value === tabValue) ?? tabs[0]!;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<LoanDTO | null>(null);
  const { user } = useAuth();
  const { data, error, loading, reload } = usePaginated<LoanDTO>(`/${module}/loans`, {
    status: tab.status,
    overdue: tab.overdue ? 'true' : undefined,
    search,
    page,
    limit: 10,
  });

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={tabs} value={tabValue} onChange={reset(setTabValue)} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchBox value={search} onChange={reset(setSearch)} placeholder="Search name or PAN" />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Nothing here right now" message={search ? 'No loans match your search.' : 'New loans will show up here automatically.'} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-3xl bg-white ring-1 ring-slate-200 md:block">
            <table className="w-full text-left">
              <thead className="border-b border-slate-100 text-sm text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Applicant</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Tenure</th>
                  <th className="px-5 py-3 font-semibold">{showRepayment ? 'Paid / Total' : 'Total repayment'}</th>
                  <th className="px-5 py-3 font-semibold">Assigned to</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((loan) => (
                  <tr key={loan.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{loan.applicant.fullName}</p>
                      <p className="font-mono text-sm text-slate-500">{loan.applicant.pan}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold tabular-nums">{formatINR(loan.principal)}</td>
                    <td className="px-5 py-4 text-slate-600">{loan.tenureDays} days</td>
                    <td className="px-5 py-4 tabular-nums">
                      {showRepayment ? (
                        <span>
                          <span className="font-semibold text-emerald-700">{formatINR(loan.amountPaid)}</span>
                          <span className="text-slate-400"> / {formatINR(loan.totalRepayment)}</span>
                        </span>
                      ) : (
                        formatINR(loan.totalRepayment)
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {loan.assignee ? (
                        <span className={loan.assignee.id === user?.id ? 'font-semibold text-indigo-700' : ''}>
                          {loan.assignee.id === user?.id ? 'You' : loan.assignee.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      <span className="block text-xs text-slate-400">Applied {formatDate(loan.appliedAt)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={loan.status} />
                        <DueChip loan={loan} />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => setSelected(loan)} className="inline-flex items-center gap-1 rounded-xl bg-brand-50 px-4 py-2 font-semibold text-brand-700 hover:bg-brand-100">
                        {actionLabel(loan)} <ChevronRight className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {data.items.map((loan) => (
              <button key={loan.id} onClick={() => setSelected(loan)} className="w-full rounded-3xl bg-white p-4 text-left ring-1 ring-slate-200 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{loan.applicant.fullName}</p>
                    <p className="text-sm text-slate-500">{formatDate(loan.appliedAt)} · {loan.tenureDays} days</p>
                    {loan.assignee && <p className="text-sm text-indigo-700">Assigned: {loan.assignee.id === user?.id ? 'You' : loan.assignee.name}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={loan.status} />
                    <DueChip loan={loan} />
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <p className="text-2xl font-extrabold tabular-nums">{formatINR(loan.principal)}</p>
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                    {actionLabel(loan)} <ChevronRight className="size-4" />
                  </span>
                </div>
                {showRepayment && (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-emerald-500" style={{ width: `${(loan.amountPaid / loan.totalRepayment) * 100}%` }} />
                  </div>
                )}
              </button>
            ))}
          </div>

          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}

      {selected &&
        renderDetail(
          selected,
          () => setSelected(null),
          () => {
            setSelected(null);
            void reload();
          },
        )}
    </div>
  );
}
