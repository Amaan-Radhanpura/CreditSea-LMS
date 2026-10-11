'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, BellRing, PiggyBank, Siren, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { formatINR, LOAN_STATUSES, type ReminderRunDTO, type StatsDTO } from '@lms/shared';
import { MODULE_META, PageHeader } from '@/components/dashboard/DashboardShell';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { STATUS_META } from '@/components/ui/StatusBadge';
import { api, errorMessage } from '@/lib/api';
import { MODULE_ORDER } from '@/lib/routes';

/** Admin home: portfolio numbers (one $facet aggregation on the server) + shortcuts to every module. */
export default function OverviewPage() {
  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  async function runReminders() {
    setRunning(true);
    try {
      const r = await api.post<ReminderRunDTO>('/admin/jobs/reminders');
      const total = r.dueReminders + r.overdueReminders + r.staffAlerts;
      toast.success(
        total
          ? `Sent ${r.dueReminders} "due tomorrow", ${r.overdueReminders} overdue and ${r.staffAlerts} staff alerts`
          : 'Checked all loans. Everyone due today has already been reminded.',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  const load = useCallback(() => {
    setError('');
    api.get<StatsDTO>('/admin/stats').then(setStats).catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const cards = stats && [
    { label: 'Total disbursed', value: formatINR(stats.totalDisbursed), icon: Banknote, tone: 'from-brand-500 to-brand-700' },
    { label: 'Collected', value: formatINR(stats.totalCollected), icon: PiggyBank, tone: 'from-emerald-500 to-emerald-700' },
    { label: 'Outstanding', value: formatINR(stats.totalOutstanding), icon: TrendingUp, tone: 'from-amber-500 to-orange-600' },
    { label: 'Open leads', value: String(stats.leads), icon: Users, tone: 'from-sky-500 to-cyan-600' },
    { label: 'Overdue loans', value: String(stats.overdueLoans), icon: Siren, tone: 'from-rose-500 to-red-600' },
  ];
  const totalLoans = stats ? Object.values(stats.loansByStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader title="Overview" description="Your whole loan book at a glance">
        <Button variant="secondary" onClick={runReminders} loading={running} icon={<BellRing className="size-5" />}>
          Run reminder check now
        </Button>
      </PageHeader>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !stats || !cards ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {cards.map((c) => (
              <div key={c.label} className={`rounded-3xl bg-gradient-to-br ${c.tone} p-5 text-white shadow-lg`}>
                <c.icon className="size-7 opacity-80" />
                <p className="mt-4 text-sm font-medium text-white/80">{c.label}</p>
                <p className="text-2xl font-extrabold tabular-nums">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
            <p className="font-bold text-slate-800">Loans by status · {totalLoans} total</p>
            <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-100">
              {LOAN_STATUSES.map((s) =>
                stats.loansByStatus[s] ? (
                  <div key={s} className={STATUS_META[s].dot} style={{ width: `${(stats.loansByStatus[s] / totalLoans) * 100}%` }} title={STATUS_META[s].label} />
                ) : null,
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {LOAN_STATUSES.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <span className={`size-3 rounded-full ${STATUS_META[s].dot}`} />
                  <span className="text-sm text-slate-600">{STATUS_META[s].label}</span>
                  <span className="ml-auto font-bold text-slate-900 sm:ml-1">{stats.loansByStatus[s]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {MODULE_ORDER.map((m) => {
              const meta = MODULE_META[m];
              return (
                <Link key={m} href={`/dashboard/${m}`} className="group rounded-3xl bg-white p-5 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-brand-200">
                  <meta.icon className="size-7 text-brand-600" />
                  <p className="mt-3 font-bold text-slate-900">{meta.label}</p>
                  <p className="text-sm text-slate-500">{meta.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                    Open <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
